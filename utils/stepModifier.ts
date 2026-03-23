export interface StepDelta {
  x: number;
  y: number;
}

export interface StepModifierConfig {
  trueStep: StepDelta;
  falseStep: StepDelta;
  isDefault: boolean;
  isValid: boolean;
}

export const DEFAULT_TRUE_STEP: StepDelta = { x: 1, y: 0 };
export const DEFAULT_FALSE_STEP: StepDelta = { x: 0, y: 1 };

const STEP_MODIFIER_PATTERN =
  /^\s*\(\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*\)\s*,\s*\(\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*\)\s*$/;

const cloneStep = (step: StepDelta): StepDelta => ({ x: step.x, y: step.y });

export const isDefaultStepModifierConfig = (config: {
  trueStep: StepDelta;
  falseStep: StepDelta;
}) =>
  config.trueStep.x === DEFAULT_TRUE_STEP.x &&
  config.trueStep.y === DEFAULT_TRUE_STEP.y &&
  config.falseStep.x === DEFAULT_FALSE_STEP.x &&
  config.falseStep.y === DEFAULT_FALSE_STEP.y;

export const parseStepModifierExpr = (
  expr: string | null | undefined
): StepModifierConfig => {
  const trimmed = expr?.trim() ?? "";
  if (!trimmed) {
    return {
      trueStep: cloneStep(DEFAULT_TRUE_STEP),
      falseStep: cloneStep(DEFAULT_FALSE_STEP),
      isDefault: true,
      isValid: true,
    };
  }

  const match = trimmed.match(STEP_MODIFIER_PATTERN);
  if (!match) {
    return {
      trueStep: cloneStep(DEFAULT_TRUE_STEP),
      falseStep: cloneStep(DEFAULT_FALSE_STEP),
      isDefault: true,
      isValid: false,
    };
  }

  const trueStep = {
    x: Number.parseInt(match[1], 10),
    y: Number.parseInt(match[2], 10),
  };
  const falseStep = {
    x: Number.parseInt(match[3], 10),
    y: Number.parseInt(match[4], 10),
  };

  return {
    trueStep,
    falseStep,
    isDefault: isDefaultStepModifierConfig({ trueStep, falseStep }),
    isValid: true,
  };
};
