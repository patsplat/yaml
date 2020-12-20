import { Scalar } from '../ast/index.js'
import type { Schema } from '../doc/Schema.js'
import type { BlockScalar, FlowScalar } from '../parse/parser.js'
import { resolveBlockScalar } from './resolve-block-scalar.js'
import { resolveFlowScalar } from './resolve-flow-scalar.js'

export function composeScalar(
  schema: Schema,
  tagName: string | null,
  token: FlowScalar | BlockScalar,
  onError: (offset: number, message: string) => void
) {
  const { offset } = token
  const { value, type, comment, length } =
    token.type === 'block-scalar'
      ? resolveBlockScalar(token, onError)
      : resolveFlowScalar(token, onError)

  const tag =
    findScalarTagByName(schema, value, tagName, onError) ||
    findScalarTagByTest(schema, value, token.type === 'scalar') ||
    findScalarTagByName(schema, value, '!', onError)

  let scalar: Scalar
  try {
    const res = tag ? tag.resolve(value, msg => onError(offset, msg)) : value
    scalar = res instanceof Scalar ? res : new Scalar(res)
  } catch (error) {
    onError(offset, error.message)
    scalar = new Scalar(value)
  }
  scalar.range = [offset, offset + length]
  if (type) scalar.type = type
  if (tagName) scalar.tag = tagName
  if (tag?.format) scalar.format = tag.format
  if (comment) scalar.comment = comment

  return scalar
}

function findScalarTagByName(
  schema: Schema,
  value: string,
  tagName: string | null,
  onError: (offset: number, message: string, warning?: boolean) => void
) {
  if (!tagName) return null
  if (tagName === '!') tagName = 'tag:yaml.org,2002:str' // non-specific tag
  const matchWithTest: Schema.Tag[] = []
  for (const tag of schema.tags) {
    if (tag.tag === tagName) {
      if (tag.default && tag.test) matchWithTest.push(tag)
      else return tag
    }
  }
  for (const tag of matchWithTest) if (tag.test?.test(value)) return tag
  const kt = schema.knownTags[tagName]
  if (kt) {
    // Ensure that the known tag is available for stringifying,
    // but does not get used by default.
    schema.tags.push(Object.assign({}, kt, { default: false, test: undefined }))
    return kt
  }
  onError(0, `Unresolved tag: ${tagName}`, tagName !== 'tag:yaml.org,2002:str')
  return null
}

function findScalarTagByTest(schema: Schema, value: string, apply: boolean) {
  if (apply) {
    for (const tag of schema.tags) {
      if (tag.default && tag.test?.test(value)) return tag
    }
  }
  return null
}
