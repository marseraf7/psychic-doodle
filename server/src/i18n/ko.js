/*
 * Chữ phía máy chủ – tiếng Hàn (ko), theo mẫu server/src/i18n/ja.js: cùng các mục, cùng khoá và cùng biến {x} như bản tiếng
 * Anh (server/src/langs.js; bài thử i18n-langs.test.js).
 *   og     – thẻ xem trước link chia sẻ (og-meta.js, bảng S.en)
 *   move   – trang chuyển tên miền (domain-move.js): [chữ, nút có {host}]
 *   mail   – thư mã xác minh / đặt lại mật khẩu (hub/shared.js): body(u = tên, c = mã)
 *   widget – widget bàn cờ của connector MCP (mcp/ui/widget-i18n.js, bảng en)
 */
'use strict';

module.exports = {
  og: {
    won: '{name} 승리', draw: '무승부', unfinished: '끝나지 않은 대국', moves: '{n}수',
    replay_d: '{result} · {n}수 · 한 수씩 다시 보기, 로그인 필요 없음',
    live_t: '대국 중: {x} 대 {o}', live_d: '{n}수 · 눌러서 실시간 관전, 로그인 필요 없음',
    room_t: '오목 초대 · 방 {code}', room_d: '눌러서 방에 들어가 바로 대국하세요. 가입 필요 없음',
    tour_d: '오목 대회 · {n}명 · 일정, 결과, 참가 신청',
    ot_d: '대회 · {n}팀 / 명 · 대진표와 결과',
    club_t: '{name} 클럽', club_d: '오목 클럽 · 회원 {n}명',
    user_d: '레이팅 {r} · {g}판 · 플레이어 프로필',
    bc_t: '중계: {name}', bc_d: '대국 {n}판 진행 중 · 실시간 관전, 순위표, 결과',
    cls_d: '오목 스터디 · {n}장 · 국면, 변화, 코멘트',
    home_d: '친구나 컴퓨터와 무료로 오목을 두세요. 브라우저에서 바로 플레이',
  },
  move: ['Caro x Gomoku가 새 주소로 이사했어요. 데이터(로그인, 진행 상황, 설정)를 옮기는 중…', '{host} 열기'],
  mail: {
    verify: {
      subject: 'Caro x Gomoku 이메일 인증 코드',
      body: (u, c) => `${u}님, 안녕하세요.\n\n이메일 인증 코드는 ${c}입니다.\n이 코드는 30분 동안 유효합니다.\n\nCaro x Gomoku 계정에 이 이메일 주소를 추가한 적이 없다면 이 메일을 무시하세요.`,
    },
    reset: {
      subject: 'Caro x Gomoku 비밀번호 재설정 코드',
      body: (u, c) => `${u}님, 안녕하세요.\n\n비밀번호 재설정 코드는 ${c}입니다.\n이 코드는 15분 동안 유효합니다.\n\n요청한 적이 없다면 이 메일을 무시하세요.`,
    },
  },
  widget: {
    your_move: '내 차례', thinking: '컴퓨터가 생각 중…', you_win: '승리했어요!', you_lose: '컴퓨터 승리',
    draw: '무승부', undo: '무르기', new_game: '새 대국', full: '전체 버전에서 플레이', you: '나: {side}', move_n: '{n}수',
    easy: '쉬움', normal: '보통', hard: '어려움', rule_vn: '베트남식 Caro', rule_free: '자유 규칙', rule_std: '표준 규칙',
    rule_renju: '렌주', puzzle: '퍼즐 #{id}', daily: '오늘의 퍼즐', goal: '{side} 차례, {n}수 만에 승리',
    tap_key: '결정적인 수를 누르세요', correct: '정답! 그게 결정적인 수예요.', wrong: '아니에요. 다시 해 보세요.',
    reveal: '정답 보기', next: '다음 퍼즐', solution: '정답: {move}', hint: '{side} 추천 수: {move}',
    play_here: '여기서 대국', error: '오류가 발생했어요: {msg}', checking: '확인 중…',
    r_win: '줄이 완성되어 바로 이겨요.', r_block: '상대의 즉시 승리를 막아요.',
    r_forced: '{n}수짜리 필승 수순의 시작이에요.', r_defend: '최선의 수비지만 상대에게 필승 수순이 있어요.',
    r_search: '찾은 수 중 가장 강한 수예요. 승리 확률: {p}%.', r_opening: '첫 수: 판 가운데에서 시작해요.',
    board: '오목판', last: '마지막 수',
  },
};
