/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  FB4A SSL Pinning Bypass (com.facebook.katana)          ║
 * ║  Bypass by Danieldev (@zadevz)                          ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  Run: frida -U -f com.facebook.katana -l hook.js        ║
 * ║       frida -U -p <pid> -l hook.js                      ║
 * ║                                                         ║
 * ║  Layer 1: Native — CModule replace SSL verify funcs     ║
 * ║  Layer 2: Java  — TrustManager + HostnameVerifier noop  ║
 * ╚══════════════════════════════════════════════════════════╝
 */

'use strict';

console.log("╔══════════════════════════════════════════════╗");
console.log("║  FB4A SSL Pinning Bypass                     ║");
console.log("║  Bypass by Danieldev (@zadevz)               ║");
console.log("╚══════════════════════════════════════════════╝");

// ─── Config ────────────────────────────────────────────────────────────────────
var LIB_TARGET  = "libcoldstart.so";
var SYMBOL_FULL = "_ZN8proxygen15SSLVerification17verifyWithMetricsEbP17x509_store_ctx_stRKNSt6__ndk212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEEPNS0_31SSLFailureVerificationCallbacksEPNS0_31SSLSuccessVerificationCallbacksERKNS_15TimeUtilGenericINS3_6chrono12steady_clockEEERNS_10TraceEventERKNS_16SSLVerifyOptionsE";

// Targets confirmed via Ghidra symbol analysis of libcoldstart.so:
//
// ┌─────────────────────────────────────────────────────────────────┐
// │ proxygen::SSLVerification::verifyWithMetrics(...)              │ ← PRIMARY
// │   The main cert verification entry point. Returns gboolean.   │
// │   Hook: replace → return TRUE                                 │
// │                                                                │
// │ proxygen::SSLVerification::SSLVerificationCallbacks            │
// │   ::verifySSLCertificate(...)                                  │ ← SECONDARY
// │   Callback invoked during verification. Hook for safety.      │
// │   Hook: replace → return TRUE                                 │
// │                                                                │
// │ proxygen::AsyncSSLSocketTransportFactory                       │
// │   ::setVerifyCertificates(bool)                                │ ← CONFIG
// │   Called during transport setup. We force arg to false.        │
// │   Hook: onEnter → args[0] = 0 (disable verify)                │
// └─────────────────────────────────────────────────────────────────┘
//
// NOT targets (same binary, different purpose):
//   fizz::openssl::detail::ecVerify        → EC sig verify (crypto)
//   facebook::museumutils::verifySupported → version check
//   cleanUpVerifyEd25519                   → Ed25519 cleanup
//   crypto_auth_hmacsha256_verify          → HMAC check

// Patterns for functions we REPLACE (return TRUE)
var REPLACE_PATTERNS = [
    ["SSLVerification", "verifyWithMetrics"],
    ["SSLVerificationCallbacks", "verifySSLCertificate"],
];

// Pattern for the config setter we INTERCEPT (force arg to false)
var CONFIG_PATTERN = ["AsyncSSLSocketTransportFactory", "setVerifyCertificates"];

// ─── Layer 1: Native bypass ────────────────────────────────────────────────────
var stub = null;
try {
    stub = new CModule([
        '#include <gum/gumdefs.h>',
        'gboolean bypass(void) { return TRUE; }'
    ].join('\n'));
} catch (_) {}

function matchPattern(name, pattern) {
    for (var k = 0; k < pattern.length; k++) {
        if (name.indexOf(pattern[k]) === -1) return false;
    }
    return true;
}

function findAllTargets(mod) {
    var replaceTargets = [];
    var configTargets = [];
    var seen = {};

    // Exact symbol first (verifyWithMetrics — the big one)
    var exact = mod.findExportByName(SYMBOL_FULL);
    if (exact) {
        replaceTargets.push({ addr: exact, name: "verifyWithMetrics (exact)" });
        seen[exact.toString()] = true;
    }

    // Scan exports for all verify-related functions
    var exps = mod.enumerateExports();
    for (var i = 0; i < exps.length; i++) {
        if (exps[i].type !== "function") continue;
        if (seen[exps[i].address.toString()]) continue;
        var n = exps[i].name;

        // Check replace patterns (return TRUE)
        for (var p = 0; p < REPLACE_PATTERNS.length; p++) {
            if (matchPattern(n, REPLACE_PATTERNS[p])) {
                replaceTargets.push({
                    addr: exps[i].address,
                    name: n.length > 70 ? n.substring(0, 70) + "..." : n
                });
                seen[exps[i].address.toString()] = true;
                break;
            }
        }

        // Check config pattern (force arg to false)
        if (!seen[exps[i].address.toString()] && matchPattern(n, CONFIG_PATTERN)) {
            configTargets.push({
                addr: exps[i].address,
                name: n.length > 70 ? n.substring(0, 70) + "..." : n
            });
            seen[exps[i].address.toString()] = true;
        }
    }

    return { replace: replaceTargets, config: configTargets };
}

function hookNative(mod) {
    var targets = findAllTargets(mod);
    var total = targets.replace.length + targets.config.length;

    if (total === 0) {
        console.log("[-] No SSL verify functions found in " + mod.name);
        return false;
    }

    var count = 0;

    // Hook verify functions → replace with stub (return TRUE)
    for (var i = 0; i < targets.replace.length; i++) {
        var t = targets.replace[i];
        var ok = false;

        if (stub && !ok) {
            try { Interceptor.replace(t.addr, stub.bypass); ok = true; } catch (_) {}
        }
        if (!ok) {
            try {
                Interceptor.attach(t.addr, {
                    onLeave: function (r) { r.replace(ptr(1)); }
                });
                ok = true;
            } catch (_) {}
        }

        if (ok) { console.log("[+] Replaced: " + t.name); count++; }
        else    { console.log("[-] Failed:   " + t.name); }
    }

    // Hook config setter → force verify = false
    for (var j = 0; j < targets.config.length; j++) {
        var c = targets.config[j];
        try {
            Interceptor.attach(c.addr, {
                onEnter: function (args) {
                    // setVerifyCertificates(bool verify)
                    // Force to false → transport layer won't even try to verify
                    args[0] = ptr(0);
                }
            });
            console.log("[+] Config:   " + c.name + " → forced false");
            count++;
        } catch (_) {
            console.log("[-] Failed:   " + c.name);
        }
    }

    console.log("[+] Native: " + count + "/" + total + " targets hooked ✓");
    return count > 0;
}

// ─── Module load detection ─────────────────────────────────────────────────────
// Attach mode: lib already loaded → hook immediately
// Spawn mode: lib not loaded yet → watch dlopen OR poll with backoff
(function () {
    var hooked = false;

    function tryHook() {
        if (hooked) return true;
        var mod = Process.findModuleByName(LIB_TARGET);
        if (mod) {
            hooked = hookNative(mod);
            return hooked;
        }
        return false;
    }

    // Phase 1: immediate check (attach mode)
    if (tryHook()) return;

    // Phase 2: try reactive dlopen hook
    var dlopenHooked = false;
    try {
        var dlopen = Module.findExportByName(null, "android_dlopen_ext");
        if (!dlopen) dlopen = Module.findExportByName(null, "dlopen");

        if (dlopen) {
            Interceptor.attach(dlopen, {
                onEnter: function (args) {
                    this.is_target = false;
                    try {
                        if (!args[0].isNull()) {
                            var path = args[0].readUtf8String();
                            this.is_target = (path !== null && path.indexOf(LIB_TARGET) !== -1);
                        }
                    } catch (_) {}
                },
                onLeave: function () {
                    if (!this.is_target || hooked) return;
                    tryHook();
                }
            });
            dlopenHooked = true;
            console.log("[*] Watching dlopen for " + LIB_TARGET + "...");
        }
    } catch (e) {
        console.log("[!] dlopen hook failed: " + e.message);
    }

    // Phase 3: polling fallback (spawn mode safety net)
    // Even if dlopen hook succeeded, poll as backup — costs almost nothing
    if (!dlopenHooked) {
        console.log("[*] Using poll fallback for " + LIB_TARGET + "...");
    }
    var delay = 50;
    var attempts = 0;
    (function tick() {
        if (hooked) return;
        if (tryHook()) return;
        if (++attempts > 120) {  // ~30s max
            console.log("[-] " + LIB_TARGET + " never loaded after " + attempts + " polls");
            return;
        }
        delay = Math.min(delay * 1.5, 1000);
        setTimeout(tick, delay);
    })();
})();

// ─── Layer 2: Java TrustManager + HostnameVerifier ────────────────────────────
Java.perform(function () {

    // ── Custom TrustManager: trust all certs ──
    try {
        var X509TM = Java.use("javax.net.ssl.X509TrustManager");
        var TrustAllManager = Java.registerClass({
            name: "com.bypass.TrustAllManager",
            implements: [X509TM],
            methods: {
                checkClientTrusted: function () {},
                checkServerTrusted: function () {},
                getAcceptedIssuers: function () {
                    // Return empty X509Certificate array (proper type)
                    return Java.array("java.security.cert.X509Certificate", []);
                },
            }
        });

        var SSLContext = Java.use("javax.net.ssl.SSLContext");
        var ctx = SSLContext.getInstance("TLS");
        ctx.init(null, [TrustAllManager.$new()], null);
        SSLContext.setDefault(ctx);
        console.log("[+] TrustManager override ✓");
    } catch (e) {
        console.log("[-] TrustManager: " + e.message);
    }

    // ── HostnameVerifier: accept all hostnames ──
    try {
        var HV = Java.use("javax.net.ssl.HostnameVerifier");
        var AllowAll = Java.registerClass({
            name: "com.bypass.AllowAllHostnames",
            implements: [HV],
            methods: {
                verify: function () { return true; }
            }
        });

        var HttpsURLConnection = Java.use("javax.net.ssl.HttpsURLConnection");
        HttpsURLConnection.setDefaultHostnameVerifier(AllowAll.$new());
        console.log("[+] HostnameVerifier override ✓");
    } catch (e) {
        console.log("[-] HostnameVerifier: " + e.message);
    }

    // ── OkHttp CertificatePinner: try standard + FB obfuscated ──
    var pinnerBypassed = false;

    // Standard OkHttp (unlikely in FB but covers forks)
    try {
        var CertPinner = Java.use("okhttp3.CertificatePinner");
        CertPinner.check.overload("java.lang.String", "java.util.List").implementation = function () {};
        console.log("[+] OkHttp3 CertificatePinner ✓");
        pinnerBypassed = true;
    } catch (_) {}

    // FB's bundled OkHttp (obfuscated package names)
    if (!pinnerBypassed) {
        try {
            // Scan loaded classes for anything that looks like CertificatePinner
            Java.enumerateLoadedClasses({
                onMatch: function (className) {
                    // FB often bundles as com.facebook.common.okhttp or X.XXX
                    if (className.indexOf("CertificatePinner") !== -1) {
                        try {
                            var cls = Java.use(className);
                            var methods = cls.class.getDeclaredMethods();
                            for (var i = 0; i < methods.length; i++) {
                                var mName = methods[i].getName();
                                if (mName === "check" || mName.indexOf("check") === 0) {
                                    cls[mName].overloads.forEach(function (overload) {
                                        overload.implementation = function () {};
                                    });
                                    console.log("[+] " + className + "." + mName + " bypassed ✓");
                                    pinnerBypassed = true;
                                }
                            }
                        } catch (_) {}
                    }
                },
                onComplete: function () {}
            });
        } catch (_) {}
    }

    if (!pinnerBypassed) {
        console.log("[*] No CertificatePinner found (native bypass covers this)");
    }

    console.log("[*] All layers armed — SSL pinning is dead 💀");
});
