// An author is one item, their page (/authors/ann): what it says of them, then each list behind its tabs, merged into
// it as a story's pages are. These are their works (/works/stories, /works/audio) and their favorites
// (/favorites/authors, /favorites/stories, /favorites/audio). The author's page links to one list of favorites alone,
// which links to the others, so every page names the lists it links to, and any page but the author's own is an alias
// of it. Content is read from the page's own part, as the default parse takes in the site's menus, which take up much
// of so short a page.

// What a list shows of one work or favorite author.
const LIST_ENTRIES = 'article[class*="_card_"], a[class*="_authorname_"]'

// How many times a list asks for more. Each is a request of 50 entries that the scrape gap does not space out, and the
// scrape waits for a page 15 seconds at most, so a long list stops at about 200 entries: those further down weigh
// little anyway.
const SHOW_MORE_TIMES = 3

// A long list's further entries, which only its Show more button loads: ?page=2 shows the first ones again.
async function showMore() {
  for (let times = 0; times < SHOW_MORE_TIMES; times++) {
    const button = document.querySelector('button[class*="_show_more_"]')
    if (!button) {
      return
    }
    const shown = document.querySelectorAll(LIST_ENTRIES).length
    button.click()
    await waitFor(() => document.querySelectorAll(LIST_ENTRIES).length > shown, 2000)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

// The pages of the lists a page links to, works first: other authors' cards link to their own lists, and a link's query
// only sorts or opens a dialog.
function authorLists(authorUrl) {
  const lists = [...linkUrls('a[href*="/works/"]'), ...linkUrls('a[href*="/favorites/"]')]
    .map(url => url.split('?')[0])
    .filter(url => url.startsWith(`${authorUrl}/`))
  return Array.from(new Set(lists))
}

// The page's title without the site's name, which every Literotica title ends with.
function literoticaTitle() {
  return document.title.replace(/ - Literotica\.com$/, '')
}

async function parseLiteroticaAuthor() {
  const author = location.pathname.match(/^\/authors\/[^/]+/)?.[0]
  if (location.hostname !== 'www.literotica.com' || !author) {
    return null
  }
  await showMore()
  const authorUrl = location.origin + author
  const favorites = linkedAuthors('a[class*="_authorname_"]')
  // The page's own part: a list's leaves out the author's head, which each list repeats, and their bio lies outside it.
  const page = document.querySelector(location.href === authorUrl ? '#main-content .page' : '#main-content .page__main')
  const result = {
    title: literoticaTitle(),
    listing: true,
    content: page ? [...textBlocks(page, { lists: true }), ...favorites.map(({ name }) => name)] : undefined,
    links: listingOf([...linkUrls('a[class*="_title_link_"][href*="/s/"]'), ...favorites.map(({ url }) => url)])?.links ?? [],
    additionalUrls: authorLists(authorUrl),
  }
  if (location.href !== authorUrl) {
    result.canonicalUrl = authorUrl
  }
  return result
}

// The parser a scrape calls.
registerParser(parseLiteroticaAuthor)
