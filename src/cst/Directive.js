import { Type } from '../constants.js'
import { Node } from './Node.js'
import { Range } from './Range.js'

export class Directive extends Node {
  constructor() {
    super(Type.DIRECTIVE)
    this.name = null
  }

  get parameters() {
    const raw = this.rawValue
    return raw ? raw.trim().split(/[ \t]+/) : []
  }

  parseName(start) {
    const { src } = this.context
    let offset = start
    let ch = src[offset]
    while (ch && ch !== '\n' && ch !== '\t' && ch !== ' ')
      ch = src[(offset += 1)]
    this.name = src.slice(start, offset)
    return offset
  }

  parseParameters(start) {
    const { src } = this.context
    let offset = start
    let ch = src[offset]
    while (ch && ch !== '\n' && ch !== '#') ch = src[(offset += 1)]
    this.valueRange = new Range(start, offset)
    return offset
  }

  parse(context, start) {
    this.context = context
    let offset = this.parseName(start + 1)
    offset = this.parseParameters(offset)
    offset = this.parseComment(offset)
    this.range = new Range(start, offset)
    return offset
  }
}
