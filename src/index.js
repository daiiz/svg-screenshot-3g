// from https://github.com/TheTeamJ/tiny-svg-screenshot/pull/64

function createStyleNode(node, markName) {
  const camelToKebabCase = (str) => {
    return str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
  }

  const styleNode = document.createElement('style')
  if (node.tagName === 'HTML' || node.tagName === 'BODY') {
    return styleNode
  }
  const cssStyleDeclaration = window.getComputedStyle(node)
  const style = Object.create(null)
  for (const key of Object.keys(cssStyleDeclaration)) {
    const keyStr = `${key}`
    if (!/^[a-z]/i.test(keyStr)) continue
    style[key] = cssStyleDeclaration[key]
  }
  let styleStr = ''
  for (const key of Object.keys(style)) {
    const prop = camelToKebabCase(key)
    if (prop.startsWith('webkit')) continue
    if (prop === 'visibility' && style[prop] !== 'hidden') continue
    styleStr += `${prop}: ${style[key]}; `
  }
  styleNode.dataset.mark = markName
  styleNode.innerText = `.${markName} { ${styleStr} }`
  return styleNode
}

function getCommonParentElement(range) {
  const candidate = range.commonAncestorContainer
  if (candidate.nodeType === Node.ELEMENT_NODE) {
    return candidate
  }
  return candidate.parentElement
}

function createEntityDtd() {
  const entities = [['nbsp', '&#x00A0;']]
  const defs = entities.map((x) => {
    return `<!ENTITY ${x[0]} "${x[1]}" >`
  })
  return `<!DOCTYPE svg [\n${defs.join('\n')}\n]>`
}

function generateSvgStr(domshot, viewport) {
  const w = viewport.width
  const h = viewport.height
  const viewportStr = `${viewport.x} ${viewport.y} ${w} ${h}`
  const svgLines = [
    `<svg width="${w}" height="${h}" viewBox="${viewportStr}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`,
    `  <foreignObject x="0" y="0" width="${
      w + PREVEW_PADDING + viewport.x
    }" height="${h + PREVEW_PADDING + viewport.y}">`,
    '  <html xmlns="http://www.w3.org/1999/xhtml">',
    '  <head>',
    `    <base href="${window.location.href}" />`,
    '  </head>',
    '  <div class="body">',
    `    <style>`,
    '    foreignObject { margin: 0; padding: 0; background-color: #fff; }', // TODO: 背景色のコントロール
    `    .body { margin: ${PREVEW_MARGIN}px !important; padding: ${PREVEW_PADDING}px; !important; }`,
    '    </style>',
    domshot.outerHTML,
    '  </div>',
    '  </html>',
    '  </foreignObject>',
    '</svg>',
  ]
  return svgLines.join('\n')
}

function preview(elemHtml = '', insertMargin = false, fillBackground = false) {
  const w = window.open()
  w.document.write(elemHtml)
  if (insertMargin) {
    w.document.querySelector(
      'body'
    ).style = `margin: ${PREVEW_MARGIN}px !important; padding: ${PREVEW_PADDING}px; !important;`
  }
  if (fillBackground) {
    w.document.querySelector('body').style.backgroundColor = '#444'
    w.document.querySelector(
      'svg'
    ).style = `box-shadow: 0 0 4px rgb(0 0 0 / 40%);`
  }

  // preview SVG text and render the save button
  const pre = document.createElement('pre')
  pre.style.color = '#fafafa'
  pre.style.display = 'block'
  pre.innerText = elemHtml
  const svgStrWithDtd = createEntityDtd() + '\n' + elemHtml
  const blob = new Blob([svgStrWithDtd], {
    type: 'image/svg+xml; charset="utf-8"',
  })
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.style.display = 'inline-block'
  a.style.color = '#fafafa'
  a.innerText = 'Download as SVG'
  a.download = `svgscreenshot3g_${Math.floor(new Date().getTime())}.svg`
  a.href = blobUrl
  const aWrapper = document.createElement('div')
  aWrapper.style.display = 'block'
  aWrapper.appendChild(a)
  w.document.body.appendChild(aWrapper)
  w.document.body.appendChild(pre)
}

// XXX: MDNで仕様を再確認する
function removeSensitiveAttributes(prefix, nodes = []) {
  for (const node of nodes) {
    node.removeAttribute('id')
    node.removeAttribute('srcset')
    node.removeAttribute('sizes')
    const classNames = Array.from(node.classList)
    for (const cn of classNames) {
      if (cn.startsWith(prefix)) continue
      node.classList.remove(cn)
    }
    const dataset = node.dataset
    for (const key of Object.keys(dataset)) {
      delete node.dataset[key]
    }
  }
}

function correctAnchors(nodes = []) {
  for (const node of nodes) {
    if (node.tagName !== 'A') continue
    if ((node.getAttribute('href') || '').startsWith('javascript:')) {
      node.setAttribute('href', '#')
      continue
    }
    // 絶対URLで上書き
    node.setAttribute('href', node.href)
    // 別タブで開くよう変更
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noreferrer noopener')
  }
}

// 抽出された要素に対する処理
function formatElements(prefix, rootElem) {
  const elems = rootElem.querySelectorAll('*')
  removeSensitiveAttributes(prefix, [rootElem, ...elems])
  correctAnchors([rootElem, ...elems])
  const markNames = [`${prefix}0`]
  for (const elem of elems) {
    // SVGに対応するため、classNameでアクセスしない
    const markName = elem.getAttribute('class')
    if (markName && markName.startsWith(prefix)) {
      const cn = markName.split(' ').filter((c) => /[0-9]+$/.test(c))
      if (cn.length === 0) continue
      if (!markNames.includes(cn[0])) {
        markNames.push(cn[0])
      }
    }
  }
  return markNames //.sort()
}

class CloneRangeDom {
  constructor(prefix) {
    /* 定数 */
    this.PREFIX = prefix || '__daiiz_clone_range_dom_'
    /* 状態管理 */
    this.nodeCounter = 0
    this._refs = [] // keep reference of nodes
    this._widths = [] // x + width の値を集める
    this._heights = [] // y + height の値を集める
    this.min_x = -1
    this.max_x = -1
    this.min_y = -1
    this.max_y = -1
    this.tmpDiv = null
  }

  cleanNodes(nodes = [], clear = false) {
    for (const node of nodes) {
      const classNames = Array.from(node.classList)
      for (const cn of classNames) {
        if (cn.startsWith(this.PREFIX)) {
          node.classList.remove(cn)
        }
      }
    }
    if (clear) {
      nodes.length = 0
    }
  }

  getContainerSize(range) {
    const candidate = {}
    if (this.max_x > 0 && this.max_y > 0) {
      candidate.width = this.max_x - this.min_x
      candidate.height = this.max_y - this.min_y
      return candidate
    }
    const rect = range.getBoundingClientRect()
    const stageRect = {
      width: rect.width,
      height: rect.height,
    }
    return stageRect
  }

  markNode(node) {
    this.cleanNodes([node])
    node.classList.add(`${this.PREFIX}${this.nodeCounter}`)
    this.nodeCounter += 1
    this._refs.push(node)
  }

  generateRangeStyles(markNamesInRange = [], rootIdx = 0) {
    const styles = []
    const marginTops = []
    for (const markName of markNamesInRange) {
      const elem = document.querySelector(`.${markName}`)
      styles.push(createStyleNode(elem, markName))

      if (elem.nodeType !== Node.ELEMENT_NODE) continue
      const { x, y, top, bottom, left, right, width, height } =
        elem.getBoundingClientRect()
      this._widths.push(x + width)
      this._heights.push(y + height)

      const [_, markIndex] = markName.match(/([0-9]+)$/)
      if (markName !== `${this.PREFIX}${rootIdx}`) {
        const style = getComputedStyle(elem)
        const m = {
          left: +style.marginLeft.replace('px', ''),
          right: +style.marginRight.replace('px', ''),
          top: +style.marginTop.replace('px', ''),
          bottom: +style.marginBottom.replace('px', ''),
        }
        marginTops.push(m.top) //, markIndex])
        if (this.min_x < 0 || left - m.left < this.min_x) {
          this.min_x = left - m.left
        }
        if (this.min_y < 0 || top - m.top < this.min_y) {
          this.min_y = top - m.top
        }
        if (this.max_x < 0 || right > this.max_x) {
          this.max_x = right
        }
        if (this.max_y < 0 || bottom > this.max_y) {
          this.max_y = bottom
        }
      }
    }
    return [styles, marginTops]
  }

  cloneDocumentTree(range) {
    const selection = window.getSelection()
    const isIgnoreNode = (node) => {
      const tagName = (node.tagName || '').toLowerCase()
      // XXX: 仕様を再確認
      const ignoreTagNames = [
        'embed',
        'script',
        'style',
        'link',
        'meta',
        'source',
      ]
      if (ignoreTagNames.includes(tagName)) {
        return true
      }
      return false
    }

    const prefix = this.PREFIX
    const rangeParent = getCommonParentElement(range)

    // 幅優先で探索
    let markerCounter = 0
    let rootMarkerCounter = 0
    let nodes = document.body.childNodes

    // 2回たどる必要がある
    // 1回目: マーキング
    while (nodes.length) {
      let nextNodes = []
      for (const [i, node] of nodes.entries()) {
        if (isIgnoreNode(node)) {
          continue
        }
        if (node === rangeParent) {
          rootMarkerCounter = markerCounter
        }
        if (node.contains(rangeParent) || rangeParent.contains(node)) {
          if (!node.classList) {
            continue // OK?
          }
          node.classList.add(prefix)
          node.classList.add(`${prefix}${markerCounter}`)
          nextNodes.push(node)
          markerCounter += 1
        }
      }
      nodes = []
      for (const node of nextNodes) {
        const childNodes = node.childNodes
        if (!childNodes) continue
        for (const [j, n] of childNodes.entries()) nodes.push(n)
      }
    }

    // 2回目: マーキングされたnodesだけ中身が維持された状態でcloneする
    const body = document.body.cloneNode(true)
    nodes = body.childNodes
    while (nodes.length) {
      let nextNodes = []
      for (const [i, node] of nodes.entries()) {
        if (isIgnoreNode(node) || !node.classList) {
          node.outerHTML = ''
          continue
        }
        if (!node.classList.contains(prefix)) {
          node.innerHTML = ''
          continue
        }
        nextNodes.push(node)
      }
      nodes = []
      for (const node of nextNodes) {
        const childNodes = node.childNodes
        if (!childNodes) continue
        for (const [j, n] of childNodes.entries()) {
          nodes.push(n)
        }
      }
    }

    const wrappr = document.createElement('div')
    wrappr.className = `${this.PREFIX}wrapper`
    nodes = body.childNodes
    // 仕上げはレベル0のみ見ればOK
    for (const [i, node] of nodes.entries()) {
      if (isIgnoreNode(node) || !node.classList) continue
      if (node.classList.contains(prefix)) {
        wrappr.appendChild(node)
      }
    }
    return [wrappr, rootMarkerCounter]
  }

  generateDomshot(rootElem, styleElems, diffMarginTop, range) {
    const container = document.createElement('div')
    container.className = `${this.PREFIX}container`

    // コンテナサイズを決定する
    const containerRect = this.getContainerSize(range)
    const containerStyle = {
      width: `${containerRect.width + 2 * PADDING}px`,
      height: `${containerRect.height + 2 * PADDING}px`,
      border: '1px solid cyan',
      padding: `${PADDING}px`,
      overflow: 'hidden',
      'box-sizing': 'border-box',
    }
    let rootStyleStr = ''
    for (const key of Object.keys(containerStyle)) {
      rootStyleStr += `${key}: ${containerStyle[key]}; `
    }
    const containerStyleElem = document.createElement('style')

    for (const style of [containerStyleElem, ...styleElems]) {
      container.appendChild(style)
    }

    // たぶん甘い。正しくは、viewportからはみ出る場合に限り補正すべき。
    const diffMarginTopStyle = document.createElement('style')
    diffMarginTopStyle.innerText = `div.__daiiz_clone_range_dom_0 { margin-top: ${diffMarginTop}px; }`
    container.appendChild(diffMarginTopStyle)

    const svgElems = rootElem.querySelectorAll('svg')
    for (const svgElem of svgElems) {
      svgElem.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    }

    container.appendChild(rootElem)
    return container
  }

  initShadowRoot() {
    let tmpDiv = document.getElementById(`${this.PREFIX}_tmp`)
    if (tmpDiv) {
      // 前回の結果を消す
      tmpDiv.remove()
    }
    const tmp = document.createElement('div')
    tmp.id = `${this.PREFIX}_tmp`
    tmp.style =
      'height: 1px; overflow: auto; visibility: hidden; position: absolute;'
    document.body.appendChild(tmp)

    tmpDiv = document.getElementById(`${this.PREFIX}_tmp`)
    if (!tmpDiv.shadowRoot) {
      tmpDiv.attachShadow({ mode: 'open' })
    }
    return tmpDiv
  }

  clearClassNames(markNames = []) {
    for (const markName of markNames) {
      const elem = document.querySelector(`.${markName}`)
      if (!elem || !elem.classList) continue
      elem.classList.remove(markName)
      elem.classList.remove(this.PREFIX)
    }
  }

  capture(cropRect) {
    const tmpDiv = this.initShadowRoot()
    this.tmpDiv = tmpDiv

    this.nodeCounter = 0
    this._widths.length = 0
    this._heights.length = 0

    this.min_y = -1
    this.max_y = -1
    this.min_x = -1
    this.max_x = -1

    const selection = window.getSelection()
    if (!selection.rangeCount) {
      throw new Error('Selection is empty.')
    }
    const range = selection.getRangeAt(0)
    const commonParent = getCommonParentElement(range)
    const commonParentRect = commonParent.getBoundingClientRect()

    const [rootElem, rootIdx] = this.cloneDocumentTree(range)
    const markNames = formatElements(this.PREFIX, rootElem)
    const [styleElems, marginTops] = this.generateRangeStyles(
      markNames,
      rootIdx
    )

    // マイナスマージンの補正
    const minMarginTop = Math.min(...marginTops)
    let diffMarginTop = 0
    if (minMarginTop < 0) {
      diffMarginTop = -1 * minMarginTop + 2 * PADDING
    }

    const domshot = this.generateDomshot(
      rootElem,
      styleElems,
      diffMarginTop,
      range
    )
    this.cleanNodes(this._refs, true)

    tmpDiv.shadowRoot.appendChild(domshot)
    this.clearClassNames(markNames)

    requestAnimationFrame(() => {
      // console.log({　min_x: this.min_x,　max_x: this.max_x,　min_y: this.min_y,　max_y: this.max_y　})
      // XXX: これcropRectと同じ？
      const rect = range.getBoundingClientRect()
      // XXX: 2個のsize情報からsvgのviewportを決定している。OK?
      // const size = domshot.getBoundingClientRect()
      const size = domshot
        .querySelector(`.${this.PREFIX}${rootIdx}`)
        .getBoundingClientRect()
      const tmpDivSize = tmpDiv.getBoundingClientRect()

      const trimBox = document.createElement('div')
      const rectDiffX = rect.left - commonParentRect.left
      const rectDiffY = rect.top - commonParentRect.top
      const viewport = {
        x: Math.max(
          PADDING,
          size.left - tmpDivSize.left - PADDING + PREVEW_PADDING + rectDiffX
        ),
        y: Math.max(
          PADDING,
          size.top - tmpDivSize.top - PADDING + PREVEW_PADDING + rectDiffY
        ), // TODO: ここの精度を上げたい
        width: cropRect.width + 2 * PADDING,
        height: cropRect.height + 2 * PADDING,
      }
      // Close tag
      // https://www.w3.org/TR/REC-html40/index/elements.html
      const svgStr = generateSvgStr(domshot, viewport).replace(
        /(<(?:img|input|br|hr|frame|area|base|basefont|col|isindex|link|meta|param)(\"[^"]*\"|[^\/\">])*)>/gi,
        '$1 />'
      )
      preview(svgStr, false, true)
    })
  }
}

class Cropper {
  constructor() {
    this.padding = 8
    // レンダリング結果を頼りに特定した切り抜き範囲
    this.rect = {}
    this.cloneRangeDom = new CloneRangeDom()
    this.bindEvents()
  }

  createBorder({ width, height, padding }) {
    const div = document.createElement('div')
    div.className = 'svgss2-cropper-border'
    div.style.width = width ? `${width + 2 * padding}px` : '1px'
    div.style.height = height ? `${height + 2 * padding}px` : '1px'
    div.style.backgroundColor = '#aaa'
    div.style.userSelect = 'none'
    div.style.position = 'fixed'
    return div
  }

  // 選択操作を妨げないよう、矩形の4辺をそれぞれborderとして描画する
  renderCropper({ x, y, width, height }) {
    if (!width || !height) {
      return
    }
    const p = this.padding + 1
    const t = this.createBorder({ width, padding: p })
    t.style.left = `${x - p}px`
    t.style.top = `${y - p}px`
    const b = this.createBorder({ width, padding: p })
    b.style.left = `${x - p}px`
    b.style.top = `${y + height + p}px`
    const l = this.createBorder({ height, padding: p })
    l.style.left = `${x - p}px`
    l.style.top = `${y - p}px`
    const r = this.createBorder({ height, padding: p })
    r.style.left = `${x + width + p}px`
    r.style.top = `${y - p}px`
    for (const border of [t, b, l, r]) {
      document.body.appendChild(border)
    }
    // keep
    this.rect = { x, y, width, height }
  }

  clearCropper() {
    const borders = document.querySelectorAll('div.svgss2-cropper-border')
    for (const border of borders) {
      border.remove()
    }
  }

  selectionchangeHandler() {
    const selection = window.getSelection()
    if (selection.rangeCount === 0) {
      return this.clearCropper()
    }
    const range = selection.getRangeAt(0)
    const { commonAncestorContainer, startContainer, endContainer } = range
    const contents = range.cloneContents()
    const rect = range.getBoundingClientRect()
    if (rect.width <= 20 || rect.height <= 20) {
      return this.clearCropper()
    }
    this.clearCropper()
    this.renderCropper(rect)
  }

  mouseupHandler() {
    const selection = window.getSelection()
    const border = document.querySelector('.svgss2-cropper-border')
    if (selection.rangeCount === 0 || !border) {
      return
    }
    // ss2.createLinkdata(selection)
    window.requestAnimationFrame(() => {
      this.clearCropper()
      this.clearEvents()
      this.cloneRangeDom.capture(this.rect)
      selection.empty()
    })
  }

  keyupHandler(event) {
    if (event.keyCode === ESC) {
      window.getSelection().empty()
      this.clearCropper()
      this.clearEvents()
    }
  }

  bindEvents() {
    document.addEventListener(
      'selectionchange',
      this.selectionchangeHandler.bind(this),
      false
    )
    document.addEventListener('mouseup', this.mouseupHandler.bind(this), false)
    window.addEventListener('keyup', this.keyupHandler.bind(this), false)
  }

  clearEvents() {
    document.removeEventListener(
      'selectionchange',
      this.selectionchangeHandler.bind(this),
      false
    )
    document.removeEventListener(
      'mouseup',
      this.mouseupHandler.bind(this),
      false
    )
    window.removeEventListener('keyup', this.keyupHandler.bind(this), false)
  }
}

cropper = new Cropper()
