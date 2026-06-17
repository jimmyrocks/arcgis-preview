declare const __APP_GIT_SHA__: string;

export const buildInfo = {
  gitSha: __APP_GIT_SHA__ || 'unknown',
};
