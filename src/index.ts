import { parseDocs } from './compose/parse-docs.js'
import { Document } from './doc/Document.js'
import { YAMLSemanticError } from './errors.js'
import { Options } from './options.js'
import { warn } from './warnings.js'

export { defaultOptions, scalarOptions } from './options.js'
export { Document }

export const parseAllDocuments = parseDocs

export function parseDocument(src: string, options?: Options) {
  const docs = parseDocs(src, options)
  if (docs.length > 1) {
    const errMsg =
      'Source contains multiple documents; please use YAML.parseAllDocuments()'
    docs[0].errors.unshift(new YAMLSemanticError(-1, errMsg))
  }
  return docs[0]
}

export function parse(
  src: string,
  reviver?: (key: string, value: any) => any,
  options?: Options
) {
  if (options === undefined && reviver && typeof reviver === 'object') {
    options = reviver
    reviver = undefined
  }

  const doc = parseDocument(src, options)
  doc.warnings.forEach(warning => warn(warning))
  if (doc.errors.length > 0) throw doc.errors[0]
  return doc.toJS({ reviver })
}

export function stringify(
  value: any,
  replacer?: (key: string, value: any) => any,
  options?: string | number | Options
) {
  if (typeof options === 'string') options = options.length
  if (typeof options === 'number') {
    const indent = Math.round(options)
    options = indent < 1 ? undefined : indent > 8 ? { indent: 8 } : { indent }
  }
  if (value === undefined) {
    const { keepUndefined } = options || (replacer as Options) || {}
    if (!keepUndefined) return undefined
  }
  return new Document(value, replacer || null, options).toString()
}
