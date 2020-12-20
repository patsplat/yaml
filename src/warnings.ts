/* global console, process, YAML_SILENCE_WARNINGS */

declare const YAML_SILENCE_WARNINGS: string | undefined

export function warn(warning: string | Error, type?: string) {
  if (typeof YAML_SILENCE_WARNINGS !== 'undefined' && YAML_SILENCE_WARNINGS)
    return

  if (typeof process !== 'undefined') {
    if (process.env.YAML_SILENCE_WARNINGS) return

    // This will throw in Jest if `warning` is an Error instance due to
    // https://github.com/facebook/jest/issues/2549
    if (process.emitWarning) {
      process.emitWarning(warning, type)
      return
    }
  }

  // eslint-disable-next-line no-console
  console.warn(type ? `${type}: ${warning}` : warning)
}
