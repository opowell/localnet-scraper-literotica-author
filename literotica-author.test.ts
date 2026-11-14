import { afterEach, describe, expect, it, vi } from 'vitest'
import { parserLoader, resetPage, visit } from '#scraper-test'

// The parser, evaluated with the helpers it is injected with, as a scrape runs it.
const load = parserLoader(__dirname)

afterEach(resetPage)

describe('listings', () => {
  it('marks a Literotica author as a listing', async () => {
    const { parseLiteroticaAuthor } = load('literotica-author.js', ['parseLiteroticaAuthor'])
    visit('https://www.literotica.com/authors/ann', '')
    expect((await parseLiteroticaAuthor()).listing).toBe(true)
  })
})

describe('author pages', () => {
  const ranked = (...urls: string[]) => ({ listing: true, links: urls.map((url, rank) => ({ url, score: 1 / (1 + rank / 10) })) })

  describe('a Literotica author', () => {
    const { parseLiteroticaAuthor } = load('literotica-author.js', ['parseLiteroticaAuthor'])
    const author = 'https://www.literotica.com/authors/ann'
    const main = (list: string) => `<main id="main-content"><div class="page"><header><p>ann</p></header>
      <div class="page__main"><h1>Ann's list</h1>${list}</div></div></main>`
    const card = (slug: string, by: string) => `<article class="_card_108ku_15"><h3><a href="https://www.literotica.com/s/${slug}" class="_title_link_108ku_128">${slug}</a></h3>
      <p>About ${slug}.</p><a href="https://www.literotica.com/authors/${by}/works/stories" class="_author_link_108ku_269">${by}</a></article>`

    it('names the lists behind their page, works first, and reads it from the page\'s own part', async () => {
      visit(author, `<nav><ul><li><a href="https://www.literoticavod.com/">Lit VOD</a></li></ul></nav>
        <a href="/authors/ann/favorites/authors">Favorites</a><a href="/authors/ann/works/audio?sort=new">Audio</a><a href="/authors/ann/works/audio">Audio</a>
        <a href="/authors/ann/followers">Followers</a><a href="https://www.literotica.com/favorites/stories">Yours</a>
        <main id="main-content"><div class="page"><h1>Ann</h1><div><p>A fledgling writer.</p></div><div class="page__main"></div></div></main>`)
      document.title = 'Ann\'s Author Page - Literotica.com'
      expect(await parseLiteroticaAuthor()).toEqual({
        title: 'Ann\'s Author Page',
        listing: true,
        content: ['# Ann', 'A fledgling writer.'],
        links: [],
        additionalUrls: [`${author}/works/audio`, `${author}/favorites/authors`],
      })
    })

    it('reads a list of works as part of the author, linking to each and to no category', async () => {
      visit(`${author}/works/stories`, `${main(card('one', 'ann'))}<a href="https://www.literotica.com/c/x" class="_title_link_108ku_128">A category</a>
        <a href="/authors/ann/works/stories?sort=new">Stories</a><a href="/authors/ann/favorites/authors">Favorites</a>`)
      document.title = 'Stories by Ann - Literotica.com'
      expect(await parseLiteroticaAuthor()).toEqual({
        title: 'Stories by Ann',
        listing: true,
        content: ['# Ann\'s list', '### one', 'About one.'],
        links: [{ url: 'https://www.literotica.com/s/one', score: 1 }],
        additionalUrls: [`${author}/works/stories`, `${author}/favorites/authors`],
        canonicalUrl: author,
      })
    })

    it('reads favorite stories, and leaves the lists of the authors who wrote them', async () => {
      visit(`${author}/favorites/stories`, `${main(card('one', 'bob') + card('two', 'cat'))}
        <a href="/authors/ann/favorites/authors">Authors</a><a href="/authors/ann/favorites/audio">Audio</a>`)
      const parsed = await parseLiteroticaAuthor()
      expect(parsed.links).toEqual(ranked('https://www.literotica.com/s/one', 'https://www.literotica.com/s/two').links)
      expect(parsed.additionalUrls).toEqual([`${author}/favorites/authors`, `${author}/favorites/audio`])
    })

    it('reads favorite authors, as names and links to their pages', async () => {
      const favorite = (name: string) => `<div class="_card_1ds8q_9 panel"><a aria-label="${name}" href="https://www.literotica.com/authors/${name}"></a>
        <a href="https://www.literotica.com/authors/${name}" class="_authorname_1ds8q_115">${name}</a><span title="Works">4 Stories</span></div>`
      visit(`${author}/favorites/authors`, main(favorite('bob') + favorite('cat')))
      const parsed = await parseLiteroticaAuthor()
      expect(parsed.content).toEqual(['# Ann\'s list', 'bob', 'cat'])
      expect(parsed.links).toEqual(ranked('https://www.literotica.com/authors/bob', 'https://www.literotica.com/authors/cat').links)
    })

    it('shows more of a long list, up to a limit', async () => {
      vi.useFakeTimers()
      try {
        visit(`${author}/favorites/stories`, `${main(`<div id="list">${card('s0', 'bob')}</div>`)}<button class="_show_more_hugoo_7">Show more</button>`)
        let clicks = 0
        document.querySelector('button')!.addEventListener('click', () => {
          clicks++
          document.querySelector('#list')!.insertAdjacentHTML('beforeend', card(`s${clicks}`, 'bob'))
        })
        const parsing = parseLiteroticaAuthor()
        await vi.runAllTimersAsync()
        expect((await parsing).links).toHaveLength(4)
        expect(clicks).toBe(3)
      } finally {
        vi.useRealTimers()
      }
    })

    it('stops at the end of a list, and gives up on a button that loads nothing', async () => {
      vi.useFakeTimers()
      try {
        visit(`${author}/favorites/stories`, `${main(card('one', 'bob'))}<button class="_show_more_hugoo_7">Show more</button>`)
        const button = document.querySelector('button')!
        let clicks = 0
        button.addEventListener('click', () => {
          clicks++
        })
        const stuck = parseLiteroticaAuthor()
        await vi.runAllTimersAsync()
        expect((await stuck).links).toHaveLength(1)
        expect(clicks).toBe(3)

        button.addEventListener('click', () => button.remove())
        clicks = 0
        const ended = parseLiteroticaAuthor()
        await vi.runAllTimersAsync()
        await ended
        expect(clicks).toBe(1)
      } finally {
        vi.useRealTimers()
      }
    })

    it.each(['/', '/followers', '?dialog=log-in'])('makes %s an alias of the author', async (path) => {
      visit(`${author}${path}`, main(''))
      expect((await parseLiteroticaAuthor()).canonicalUrl).toBe(author)
    })
  })
})
