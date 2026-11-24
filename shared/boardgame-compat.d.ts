/** boardgame.io 0.50 has directory entry points which native Node ESM rejects.
 * Use explicit runtime files while retaining the package's published API types. */
declare module 'boardgame.io/dist/cjs/core.js' {
  export { INVALID_MOVE } from 'boardgame.io/core';
}
declare module 'boardgame.io/dist/cjs/internal.js' {
  export { CreateGameReducer, InitializeGame } from 'boardgame.io/internal';
}
