/*
START -> stream

stream
  directive -> line-end -> stream
  indent + line-end -> stream
  [else] -> line-start

line-end
  comment -> line-end
  newline -> .
  input-end -> END

line-start
  doc-start -> doc
  doc-end -> stream
  [else] -> indent -> block-start

block-start
  seq-item-start -> block-start
  explicit-key-start -> block-start
  map-value-start -> block-start
  [else] -> doc

doc
  line-end -> line-start
  spaces -> doc
  anchor -> doc
  tag -> doc
  flow-start -> flow -> doc
  flow-end -> error -> doc
  seq-item-start -> error -> doc
  explicit-key-start -> error -> doc
  map-value-start -> doc
  alias -> doc
  quote-start -> quoted-scalar -> doc
  block-scalar-header -> line-end -> block-scalar(min) -> line-start
  [else] -> plain-scalar(false, min) -> doc

flow
  line-end -> flow
  spaces -> flow
  anchor -> flow
  tag -> flow
  flow-start -> flow -> flow
  flow-end -> .
  seq-item-start -> error -> flow
  explicit-key-start -> flow
  map-value-start -> flow
  alias -> flow
  quote-start -> quoted-scalar -> flow
  comma -> flow
  [else] -> plain-scalar(true, 0) -> flow

quoted-scalar
  quote-end -> .
  [else] -> quoted-scalar

block-scalar(min)
  newline + peek(indent < min) -> .
  [else] -> block-scalar(min)

plain-scalar(is-flow, min)
  scalar-end(is-flow) -> .
  peek(newline + (indent < min)) -> .
  [else] -> plain-scalar(min)
*/

import { DOCUMENT, SCALAR } from './token-type.js'

type State =
  | 'stream'
  | 'line-start'
  | 'block-start'
  | 'doc'
  | 'flow'
  | 'quoted-scalar'
  | 'block-scalar'
  | 'plain-scalar'

function isEmpty(ch: string) {
  switch (ch) {
    case undefined:
    case ' ':
    case '\n':
    case '\r':
    case '\t':
      return true
    default:
      return false
  }
}

const invalidFlowScalarChars = [',', '[', ']', '{', '}']
const invalidIdentifierChars = [' ', ',', '[', ']', '{', '}', '\n', '\r', '\t']
const isNotIdentifierChar = (ch: string) =>
  !ch || invalidIdentifierChars.includes(ch)

export class Lexer {
  push: (token: string) => void

  atEnd = false
  buffer = ''
  flowLevel = 0
  indent = 0
  indentMore = ''
  next: State | null = null
  pos = 0

  /**
   * Define/initialise a YAML lexer. `push` will be called separately with each
   * token when `lex()` is passed an input string.
   *
   * @public
   */
  constructor(push: (token: string) => void) {
    this.push = push
  }

  /**
   * Read YAML tokens from the `source` string, calling the callback
   * defined in the constructor for each one. If `incomplete`, a part
   * of the last line may be left as a buffer for the next call.
   *
   * @public
   */
  lex(source: string, incomplete: boolean) {
    if (source) this.buffer = this.buffer ? this.buffer + source : source
    this.atEnd = !incomplete
    let next: State | null = this.next || 'stream'
    while (next && (incomplete || this.hasChars(1))) next = this.parseNext(next)
  }

  atLineEnd() {
    let i = this.pos
    let ch = this.buffer[i]
    while (ch === ' ') ch = this.buffer[++i]
    if (!ch || ch === '#' || ch === '\n') return true
    if (ch === '\r') return this.buffer[i + 1] === '\n'
    return false
  }

  charAt(n: number) {
    return this.buffer[this.pos + n]
  }

  getLine(): string | null {
    let end = this.buffer.indexOf('\n', this.pos)
    if (end === -1) return this.atEnd ? this.buffer.substring(this.pos) : null
    if (this.buffer[end - 1] === '\r') end -= 1
    return this.buffer.substring(this.pos, end)
  }

  hasChars(n: number) {
    return this.pos + n <= this.buffer.length
  }

  setNext(state: State) {
    this.buffer = this.buffer.substring(this.pos)
    this.pos = 0
    this.next = state
    return null
  }

  peek(n: number) {
    return this.buffer.substr(this.pos, n)
  }

  parseNext(next: State) {
    switch (next) {
      case 'stream':
        return this.parseStream()
      case 'line-start':
        return this.parseLineStart()
      case 'block-start':
        return this.parseBlockStart()
      case 'doc':
        return this.parseDocument()
      case 'flow':
        return this.parseFlowCollection()
      case 'quoted-scalar':
        return this.parseQuotedScalar()
      case 'block-scalar':
        return this.parseBlockScalar()
      case 'plain-scalar':
        return this.parsePlainScalar()
      default:
        throw new Error(`Unknown state ${next}`)
    }
  }

  parseStream() {
    const line = this.getLine()
    if (line === null) return this.setNext('stream')
    if (line[0] === '%') {
      let dirEnd = line.indexOf(' #') + 1
      if (dirEnd === 0) dirEnd = line.length
      while (line[dirEnd - 1] === ' ') dirEnd -= 1
      const n = this.pushCount(dirEnd) + this.pushSpaces()
      this.pushCount(line.length - n) // possible comment
      this.pushNewline()
      return 'stream'
    }
    if (this.atLineEnd()) {
      const sp = this.pushSpaces()
      this.pushCount(line.length - sp)
      this.pushNewline()
      return 'stream'
    }
    this.push(DOCUMENT)
    return this.parseLineStart()
  }

  parseLineStart() {
    const ch = this.charAt(0)
    if (ch === '-' || ch === '.') {
      if (!this.atEnd && !this.hasChars(4)) return this.setNext('line-start')
      const s = this.peek(3)
      if (s === '---' && isEmpty(this.charAt(3))) {
        this.pushCount(3)
        this.indent = 0
        this.indentMore = ''
        return 'doc'
      } else if (s === '...' && isEmpty(this.charAt(3))) {
        this.pushCount(3)
        return 'stream'
      }
    }
    this.indent = this.pushSpaces()
    this.indentMore = ''
    return this.parseBlockStart()
  }

  parseBlockStart(): 'doc' | null {
    const [ch0, ch1] = this.peek(2)
    if (!ch1 && !this.atEnd) return this.setNext('block-start')
    if ((ch0 === '-' || ch0 === '?' || ch0 === ':') && isEmpty(ch1)) {
      const start = this.pos
      const n = this.pushCount(1) + this.pushSpaces()
      this.indentMore += this.buffer.substr(start, n)
      return this.parseBlockStart()
    }
    if (this.indentMore.length > 2) {
      let last = this.indentMore.length - 1
      while (this.indentMore[last] === ' ') last -= 1
      if (last > 0) this.indent += last
    }
    return 'doc'
  }

  parseDocument() {
    this.pushSpaces()
    const line = this.getLine()
    if (line === null) return this.setNext('doc')
    let n = this.pushIndicators()
    switch (line[n]) {
      case undefined:
      case '#':
        this.pushCount(line.length)
        this.pushNewline()
        return this.parseLineStart()
      case '{':
      case '[':
        this.pushCount(1)
        this.flowLevel = 1
        return 'flow'
      case '}':
      case ']':
        // this is an error
        this.pushCount(1)
        return 'doc'
      case '"':
      case "'":
        return this.parseQuotedScalar()
      case '|':
      case '>':
        n += this.pushUntil(isEmpty)
        n += this.pushSpaces()
        this.pushCount(line.length - n)
        this.pushNewline()
        return this.parseBlockScalar()
      default:
        return this.parsePlainScalar()
    }
  }

  parseFlowCollection() {
    while (this.pushNewline() + this.pushSpaces() > 0) {}
    const line = this.getLine()
    if (line === null) return this.setNext('flow')
    let n = line[0] === ',' ? this.pushCount(1) + this.pushSpaces() : 0
    n += this.pushIndicators()
    switch (line[n]) {
      case undefined:
      case '#':
        this.pushCount(line.length)
        this.pushNewline()
        return 'flow'
      case '{':
      case '[':
        this.pushCount(1)
        this.flowLevel += 1
        return 'flow'
      case '}':
      case ']':
        this.pushCount(1)
        this.flowLevel -= 1
        return this.flowLevel ? 'flow' : 'doc'
      case '"':
      case "'":
        return this.parseQuotedScalar()
      default:
        return this.parsePlainScalar()
    }
  }

  parseQuotedScalar() {
    const quote = this.charAt(0)
    let end = this.buffer.indexOf(quote, this.pos + 1)
    if (quote === "'") {
      while (end !== -1 && this.buffer[end + 1] === "'")
        end = this.buffer.indexOf("'", end + 2)
    } else {
      // double-quote
      while (end !== -1) {
        let n = 0
        while (this.buffer[end - 1 - n] === '\\') n += 1
        if (n % 2 === 0) break
        end = this.buffer.indexOf('"', end + 1)
      }
    }
    if (end === -1) return this.setNext('quoted-scalar')
    this.pushToIndex(end + 1)
    return this.flowLevel ? 'flow' : 'doc'
  }

  parseBlockScalar() {
    const reqIndent =
      this.indent > 0 ? this.indent + 1 : this.indentMore ? 1 : 0
    let i = this.pos - 1
    let ch: string
    while ((ch = this.buffer[++i])) {
      if (ch === '\n' && reqIndent > 0) {
        let indent = 0
        let next = this.buffer[i + 1]
        while (next === ' ') next = this.buffer[++indent + i + 1]
        if (
          indent < reqIndent &&
          next !== '\n' &&
          !(next === '\r' && this.buffer[indent + i + 2] === '\n')
        )
          break
        i += indent
      }
    }
    if (!ch && !this.atEnd) return this.setNext('block-scalar')
    this.push(SCALAR)
    this.pushToIndex(i + 1)
    return this.parseLineStart()
  }

  parsePlainScalar() {
    const inFlow = this.flowLevel > 0
    const reqIndent =
      this.indent > 0 ? this.indent + 1 : this.indentMore ? 1 : 0
    let i = this.pos - 1
    let ch: string
    while ((ch = this.buffer[++i])) {
      if (ch === '\n' && reqIndent > 0) {
        let indent = 0
        while (this.buffer[i + indent + 1] === ' ') indent += 1
        if (indent < reqIndent) {
          if (this.buffer[i - 1] === '\r') i -= 1
          break
        }
        i += indent
      } else if (ch === ':') {
        const next = this.buffer[i + 1]
        if (isEmpty(next) || (inFlow && next === ',')) break
      } else if (isEmpty(ch)) {
        const next = this.buffer[i + 1]
        if (next === '#' || (inFlow && invalidFlowScalarChars.includes(next)))
          break
      } else if (inFlow && invalidFlowScalarChars.includes(ch)) break
    }
    if (!ch && !this.atEnd) return this.setNext('plain-scalar')
    this.push(SCALAR)
    this.pushToIndex(i)
    return inFlow ? 'flow' : 'doc'
  }

  pushCount(n: number) {
    if (n > 0) {
      this.push(this.buffer.substr(this.pos, n))
      this.pos += n
      return n
    }
    return 0
  }

  pushToIndex(i: number) {
    const s = this.buffer.slice(this.pos, i)
    if (s) {
      this.push(s)
      this.pos += s.length
      return s.length
    }
    return 0
  }

  pushIndicators(): number {
    switch (this.charAt(0)) {
      case '!':
      case '&':
      case '*':
        return (
          this.pushUntil(isNotIdentifierChar) +
          this.pushSpaces() +
          this.pushIndicators()
        )
      case ':':
      case '?': // this is an error outside flow collections
      case '-': // this is an error
        if (isEmpty(this.charAt(1))) {
          this.indentMore += '  '
          return this.pushCount(1) + this.pushSpaces() + this.pushIndicators()
        }
    }
    return 0
  }

  pushNewline() {
    const ch = this.buffer[this.pos]
    if (ch === '\n') return this.pushCount(1)
    else if (ch === '\r' && this.charAt(1) === '\n') return this.pushCount(2)
    else return 0
  }

  pushSpaces() {
    let i = this.pos
    while (this.buffer[i] === ' ') i += 1
    const n = i - this.pos
    if (n > 0) {
      this.push(this.buffer.substr(this.pos, n))
      this.pos = i
    }
    return n
  }

  pushUntil(test: (ch: string) => boolean) {
    let i = this.pos
    let ch = this.buffer[i]
    while (!test(ch)) ch = this.buffer[++i]
    return this.pushToIndex(i)
  }
}
