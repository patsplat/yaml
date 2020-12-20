import { Type } from './constants'
import { CST } from './cst'

interface LinePos {
  line: number
  col: number
}

export class YAMLError extends Error {
  name:
    | 'YAMLReferenceError'
    | 'YAMLSemanticError'
    | 'YAMLSyntaxError'
    | 'YAMLWarning'
  message: string
  source?: CST.Node

  nodeType?: Type
  range?: CST.Range
  linePos?: { start: LinePos; end: LinePos }

  /**
   * Drops `source` and adds `nodeType`, `range` and `linePos`, as well as
   * adding details to `message`. Run automatically for document errors if
   * the `prettyErrors` option is set.
   */
  makePretty(): void
}

export class YAMLReferenceError extends YAMLError {
  name: 'YAMLReferenceError'
}

export class YAMLSemanticError extends YAMLError {
  name: 'YAMLSemanticError'
}

export class YAMLSyntaxError extends YAMLError {
  name: 'YAMLSyntaxError'
}

export class YAMLWarning extends YAMLError {
  name: 'YAMLWarning'
}
