import YAML from '../../src/index'
import { stringify as stringifyStr, strOptions } from '../../src/schema/_string'

test('undefined', () => {
  expect(YAML.stringify()).toBe('\n')
})

test('null', () => {
  expect(YAML.stringify(null)).toBe('null\n')
})

describe('boolean', () => {
  test('true', () => {
    expect(YAML.stringify(true)).toBe('true\n')
  })
  test('false', () => {
    expect(YAML.stringify(false)).toBe('false\n')
  })
})

describe('number', () => {
  test('integer', () => {
    expect(YAML.stringify(3)).toBe('3\n')
  })
  test('float', () => {
    expect(YAML.stringify(3.141)).toBe('3.141\n')
  })
  test('zero', () => {
    expect(YAML.stringify(0)).toBe('0\n')
  })
  test('NaN', () => {
    expect(YAML.stringify(NaN)).toBe('.nan\n')
  })
})

describe('string', () => {
  let origFoldOptions
  beforeAll(() => {
    origFoldOptions = strOptions.fold
    strOptions.fold = {
      lineWidth: 20,
      minContentWidth: 0
    }
  })
  afterAll(() => {
    strOptions.fold = origFoldOptions
  })

  test('plain', () => {
    expect(YAML.stringify('STR')).toBe('STR\n')
  })
  test('double-quoted', () => {
    expect(YAML.stringify('"x"')).toBe('\'"x"\'\n')
  })
  test('single-quoted', () => {
    expect(YAML.stringify("'x'")).toBe('"\'x\'"\n')
  })
  test('escaped', () => {
    expect(YAML.stringify('null: \u0000')).toBe('"null: \\0"\n')
  })
  test('short multiline', () => {
    expect(YAML.stringify('blah\nblah\nblah')).toBe('|-\nblah\nblah\nblah\n')
  })
  test('long multiline', () => {
    expect(
      YAML.stringify(
        'blah blah\nblah blah blah blah blah blah blah blah blah blah\n'
      )
    ).toBe(`>
blah blah

blah blah blah blah
blah blah blah blah
blah blah\n`)
  })
})

describe('circular references', () => {
  test('parent at root', () => {
    const map = { foo: 'bar' }
    map.map = map
    expect(YAML.stringify(map)).toBe(`&a1
foo: bar
map: *a1\n`)
  })

  test('ancestor at root', () => {
    const baz = {}
    const map = { foo: { bar: { baz } } }
    baz.map = map
    expect(YAML.stringify(map)).toBe(`&a1
foo:
  bar:
    baz:
      map: *a1\n`)
  })

  test('sibling sequences', () => {
    const one = ['one']
    const two = ['two']
    const seq = [one, two, one, one, two]
    expect(YAML.stringify(seq)).toBe(`- &a1
  - one
- &a2
  - two
- *a1
- *a1
- *a2\n`)
  })

  test('further relatives', () => {
    const baz = { a: 1 }
    const seq = [{ foo: { bar: { baz } } }, { fe: { fi: { fo: { baz } } } }]
    expect(YAML.stringify(seq)).toBe(`- foo:
    bar:
      baz:
        &a1
        a: 1
- fe:
    fi:
      fo:
        baz: *a1\n`)
  })

  test('only match objects', () => {
    const date = new Date('2001-12-15T02:59:43.1Z')
    const seq = ['a', 'a', 1, 1, true, true, date, date]
    expect(YAML.stringify(seq, { anchorPrefix: 'foo', version: '1.1' }))
      .toBe(`- a
- a
- 1
- 1
- true
- true
- &foo1 2001-12-15T02:59:43.100Z
- *foo1\n`)
  })
})

test('array', () => {
  const array = [3, ['four', 5]]
  const str = YAML.stringify(array)
  expect(str).toBe(
    `- 3
- - four
  - 5\n`
  )
})

test('object', () => {
  const object = { x: 3, y: [4], z: { w: 'five', v: 6 } }
  const str = YAML.stringify(object)
  expect(str).toBe(
    `x: 3
y:
  - 4
z:
  w: five
  v: 6\n`
  )
})

test('Map with non-Pair item', () => {
  const doc = new YAML.Document()
  doc.contents = YAML.createNode({ x: 3, y: 4 })
  expect(String(doc)).toBe('x: 3\ny: 4\n')
  doc.contents.items.push('TEST')
  expect(() => String(doc)).toThrow(/^Map items must all be pairs.*TEST/)
})

test('eemeli/yaml#43: Quoting colons', () => {
  const doc = new YAML.Document()
  doc.contents = YAML.createNode({ key: ':' })
  const str = String(doc)
  expect(() => YAML.parse(str)).not.toThrow()
  expect(str).toBe('key: ":"\n')
})

test('eemeli/yaml#52: Quoting item markers', () => {
  const doc = new YAML.Document()
  doc.contents = YAML.createNode({ key: '-' })
  const str = String(doc)
  expect(() => YAML.parse(str)).not.toThrow()
  expect(str).toBe('key: "-"\n')
  doc.contents = YAML.createNode({ key: '?' })
  const str2 = String(doc)
  expect(() => YAML.parse(str2)).not.toThrow()
  expect(str2).toBe('key: "?"\n')
})

describe('eemeli/yaml#80', () => {
  const regexp = {
    class: RegExp,
    tag: '!re',
    resolve(doc, src, flags) {
      return new RegExp(src, flags)
    },
    stringify(item, ctx, onComment, onChompKeep) {
      ctx = Object.assign({ actualString: false }, ctx)
      return stringifyStr(item, ctx, onComment, onChompKeep)
    }
  }

  beforeAll(() => {
    YAML.defaultOptions.tags = [regexp]
  })

  afterAll(() => {
    YAML.defaultOptions.tags = []
  })

  test('stringify as plain scalar', () => {
    const str = YAML.stringify(/re/g)
    expect(str).toBe('!re /re/g\n')
    const res = YAML.parse(str)
    expect(res).toBeInstanceOf(RegExp)
  })

  test('stringify as quoted scalar', () => {
    const str = YAML.stringify(/re: /g)
    expect(str).toBe('!re "/re: /g"\n')
    const res = YAML.parse(str)
    expect(res).toBeInstanceOf(RegExp)
  })

  test('parse plain string as string', () => {
    const res = YAML.parse('/re/g')
    expect(res).toBe('/re/g')
  })

  test('parse quoted string as string', () => {
    const res = YAML.parse('"/re/g"')
    expect(res).toBe('/re/g')
  })
})

test('reserved names', () => {
  const str = YAML.stringify({ comment: 'foo' })
  expect(str).toBe('comment: foo\n')
})
