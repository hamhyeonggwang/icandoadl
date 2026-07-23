/* 스파이크 계승 파라미터 — 전부 초기 추정치, 개인 캘리브레이션·현장값으로 갱신 */
export const PARAMS = {
  OPEN_THRESH: 0.65,
  FIST_THRESH: 0.35,
  DEBOUNCE_MS: 130,
  RELEASE_HOLD_MS: 300,      // 기본 t_release — 스테이션 grading으로 덮어씀
  RELEASE_MAX_SPEED: 0.9,
  ALT_STROKE_WINDOW_MS: 800,
  STROKE_MIN_VY: 0.55,
  POSE_EVERY_N_FRAMES: 3,
  LEAN_DEADZONE: 0.15,
  CALIB_PHASE_MS: 5000,
  TRACK_LOSS_MS: 500,        // CARRY 중 손 미검출 → 부유 대기 전환
  ASSIST_SCALE: 1.6,         // assist 1단계 반경 배율
  ASSIST_DRIFT_SPEED: 0.03,  // assist 2단계 부유 이동 속도(정규화/초)
};
