import { Node, Pair, YAMLMap, YAMLSeq } from '../ast/index.js'
import type { Document } from '../doc/Document.js'
import type { FlowCollection, SourceToken } from '../parse/parser.js'
import { composeNode } from './compose-node.js'

export function composeFlowCollection(
  doc: Document.Parsed,
  fc: FlowCollection,
  _anchor: string | null,
  onError: (offset: number, message: string, warning?: boolean) => void
) {
  let offset = fc.offset
  const isMap = fc.start.source === '{'
  const coll = isMap ? new YAMLMap(doc.schema) : new YAMLSeq(doc.schema)
  if (_anchor) doc.anchors.setAnchor(coll, _anchor)

  let key: Node.Parsed | null = null
  let value: Node.Parsed | null = null

  let spaceBefore = false
  let comment = ''
  let hasComment = false
  let newlines = ''
  let anchor = ''
  let tagName = ''

  // let atExplicitKey = false
  let atValueEnd = false

  function resetProps() {
    spaceBefore = false
    comment = ''
    hasComment = false
    newlines = ''
    anchor = ''
    tagName = ''
    // atExplicitKey = false
    atValueEnd = false
  }

  function addItem() {
    if (value) {
      if (hasComment) value.comment = comment
    } else {
      const props = { spaceBefore, comment, anchor, tagName }
      value = composeNode(doc, offset, props, onError)
    }
    if (isMap) {
      const pair = key ? new Pair(key, value) : new Pair(value)
      coll.items.push(pair)
    } else {
      const seq = coll as YAMLSeq
      if (key) {
        const map = new YAMLMap(doc.schema)
        map.items.push(new Pair(key, value))
        seq.items.push(map)
      } else seq.items.push(value)
    }
    resetProps()
  }

  for (const token of fc.items) {
    let isSourceToken = true
    switch (token.type) {
      case 'space':
        break
      case 'comment':
        const cb = token.source.substring(1)
        if (!hasComment) {
          if (newlines) spaceBefore = true
          comment = cb
        } else comment += newlines + cb
        hasComment = true
        newlines = ''
        break
      case 'newline':
        if (atValueEnd) {
          if (hasComment) {
            let node = coll.items[coll.items.length - 1]
            if (node instanceof Pair) node = node.value || node.key
            if (node instanceof Node) node.comment = comment
            else onError(offset, 'Error adding trailing comment to node')
            comment = ''
            hasComment = false
          }
          atValueEnd = false
        } else newlines += token.source
        break
      case 'anchor':
        if (anchor) onError(offset, 'A node can have at most one anchor')
        anchor = token.source.substring(1)
        break
      case 'tag': {
        if (tagName) onError(offset, 'A node can have at most one tag')
        const tn = doc.directives.tagName(token.source, m => onError(offset, m))
        if (tn) tagName = tn
        break
      }
      case 'explicit-key-ind':
        // atExplicitKey = true
        if (anchor || tagName)
          onError(offset, 'Anchors and tags must be after the ? indicator')
        break
      case 'map-value-ind': {
        if (key) {
          if (value) {
            onError(offset, 'Missing {} around pair used as mapping key')
            const map = new YAMLMap(doc.schema)
            map.items.push(new Pair(key, value))
            map.range = [key.range[0], value.range[1]]
            key = map as YAMLMap.Parsed
            value = null
          } // else explicit key
        } else if (value) {
          key = value
          value = null
        } else {
          const props = { spaceBefore, comment, anchor, tagName }
          key = composeNode(doc, offset, props, onError) // empty node
          resetProps()
        }
        if (hasComment) {
          key.comment = comment
          comment = ''
          hasComment = false
        }
        break
      }
      case 'comma':
        addItem()
        atValueEnd = true
        key = null
        value = null
        break
      default: {
        if (value) onError(offset, 'Missing , between flow collection items')
        const props = { spaceBefore, comment, anchor, tagName }
        value = composeNode(doc, token, props, onError)
        offset = value.range[1]
        isSourceToken = false
      }
    }
    if (isSourceToken) offset += (token as SourceToken).source.length
  }
  if (key || value) addItem()
  coll.range = [fc.offset, offset]
  return coll as YAMLMap.Parsed | YAMLSeq.Parsed
}
