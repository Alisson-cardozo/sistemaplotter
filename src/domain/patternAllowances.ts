export const PLOT_HEM_CM = 0.5;
export const PLOT_LEFT_CLOSURE_CM = 1;
export const PLOT_UNION_SIDE_CM = 0.5;

export type PatternAllowance = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export function getWholePatternAllowanceCm(): PatternAllowance {
  return {
    left: PLOT_LEFT_CLOSURE_CM + PLOT_UNION_SIDE_CM,
    right: PLOT_UNION_SIDE_CM,
    top: PLOT_HEM_CM,
    bottom: PLOT_HEM_CM
  };
}

export function getDivisionPatternAllowanceCm(): PatternAllowance {
  return getWholePatternAllowanceCm();
}

export function getPatternExtraWidthCm(allowance: PatternAllowance) {
  return allowance.left + allowance.right;
}

export function getPatternExtraHeightCm(allowance: PatternAllowance) {
  return allowance.top + allowance.bottom;
}
