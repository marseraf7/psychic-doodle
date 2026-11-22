/*
 * Chữ phía máy chủ – tiếng Séc (cs). Cùng khoá và cùng biến {x} như bản tiếng Anh (mẫu: server/src/i18n/ja.js;
 * bài thử i18n-langs.test.js). Văn phong: xưng "ty", tránh số nhiều sai ("Tahy: {n}") – docs/van-phong-4-ngon-ngu.md.
 *   og     – thẻ xem trước link chia sẻ (og-meta.js, bảng S.en)
 *   move   – trang chuyển tên miền (domain-move.js): [chữ, nút có {host}]
 *   mail   – thư mã xác minh / đặt lại mật khẩu (hub/shared.js): body(u = tên, c = mã)
 *   widget – widget bàn cờ của connector MCP (mcp/ui/widget-i18n.js, bảng en)
 */
'use strict';

module.exports = {
  og: {
    won: 'Vítězí {name}', draw: 'Remíza', unfinished: 'Nedohraná partie', moves: 'Tahy: {n}',
    replay_d: '{result} · tahy: {n} · přehrávání tah po tahu, bez přihlášení',
    live_t: 'Živě: {x} vs {o}', live_d: 'Tahy: {n} · klepni a sleduj živě, bez přihlášení',
    room_t: 'Pozvánka na piškvorky · místnost {code}', room_d: 'Klepni, vstup do místnosti a hraj hned. Bez registrace',
    tour_d: 'Turnaj v piškvorkách · hráči: {n} · rozpis, výsledky, přihlášky',
    ot_d: 'Turnaj · týmy / hráči: {n} · pavouk a výsledky',
    club_t: 'Klub {name}', club_d: 'Piškvorkový klub · členové: {n}',
    user_d: 'Rating {r} · partie: {g} · profil hráče',
    bc_t: 'Přenos: {name}', bc_d: 'Probíhající partie: {n} · živý přenos, pořadí, výsledky',
    cls_d: 'Studie piškvorek · kapitoly: {n} · pozice, varianty, komentáře',
    home_d: 'Piškvorky zdarma s přáteli nebo proti počítači. Hraj hned v prohlížeči',
  },
  move: ['Caro x Gomoku se přestěhovalo na novou adresu. Přenášíme tvá data (přihlášení, postup, nastavení)…', 'Otevřít {host}'],
  mail: {
    verify: {
      subject: 'Caro x Gomoku – ověřovací kód e-mailu',
      body: (u, c) => `Ahoj ${u},\n\ntvůj ověřovací kód e-mailu je ${c}.\nKód platí 30 minut.\n\nPokud sis tento e-mail k účtu Caro x Gomoku nepřidával(a), tuto zprávu ignoruj.`,
    },
    reset: {
      subject: 'Caro x Gomoku – kód pro obnovení hesla',
      body: (u, c) => `Ahoj ${u},\n\ntvůj kód pro obnovení hesla je ${c}.\nKód platí 15 minut.\n\nPokud jsi o obnovení nežádal(a), tuto zprávu ignoruj.`,
    },
  },
  widget: {
    your_move: 'Jsi na tahu', thinking: 'Počítač přemýšlí…', you_win: 'Vítězíš!', you_lose: 'Vítězí počítač',
    draw: 'Remíza', undo: 'Zpět', new_game: 'Nová hra', full: 'Hrát plnou verzi', you: 'Ty: {side}', move_n: 'Tah {n}',
    easy: 'Lehká', normal: 'Střední', hard: 'Těžká', rule_vn: 'Vietnamské Caro', rule_free: 'Volná pravidla', rule_std: 'Standardní pravidla',
    rule_renju: 'Renju', puzzle: 'Úloha #{id}', daily: 'Úloha dne', goal: '{side} na tahu, výhra na tahy: {n}',
    tap_key: 'Klepni na rozhodující tah', correct: 'Správně! To je rozhodující tah.', wrong: 'Ne. Zkus to znovu.',
    reveal: 'Ukázat řešení', next: 'Další úloha', solution: 'Řešení: {move}', hint: 'Doporučený tah pro {side}: {move}',
    play_here: 'Hrát odsud', error: 'Došlo k chybě: {msg}', checking: 'Kontroluji…',
    r_win: 'Dokončí řadu a hned vyhrává.', r_block: 'Zastaví okamžitou výhru soupeře.',
    r_forced: 'Začátek vynucené výhry na tahy: {n}.', r_defend: 'Nejlepší obrana, ale soupeř má vynucenou výhru.',
    r_search: 'Nejsilnější nalezený tah. Šance na výhru: {p} %.', r_opening: 'První tah: začni ve středu desky.',
    board: 'Hrací deska piškvorek', last: 'Poslední tah',
  },
};
