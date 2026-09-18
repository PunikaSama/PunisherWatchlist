const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Web', 'punisher-watchlist.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Web', 'punisher-watchlist.css'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Api', 'WatchlistController.cs'), 'utf8');

for (const token of ['PunisherWatchlist/items', 'pw-watchlist-tab', 'pw-watchlist-card-button', 'pw-watchlist-detail-button', 'MuiAppBar-root', 'favoriteButton', 'pw-watchlist-card-button-adjacent', 'pw-watchlist-drawer-link', 'placeAfterFavorites', 'document.querySelectorAll(".card")', 'localStorageKey', 'pw-watchlist-route-active', 'isLibraryFolderCard', 'state.aliases', 'canonicalKey', 'canonicalClientId', '"Season"', 'const seriesId = parentSeriesId(item)', 'state.aliases.set(normalizeId(itemId), seriesId)', 'installNativeItemsProvider', 'api.getItems =', 'function watchlistHash()', 'function isStandaloneWatchlistRoute()', 'type: "tag"', 'IncludeItemTypes: "Movie,Series"', 'container.refreshItems()', 'providerActive: false', 'state.providerActive = true', 'shouldUseWatchlistProvider(state.watchlistOpen, state.providerActive)', 'window.setTimeout(() => refreshWatchlistView(), 700)', 'orderWatchlistResult(result, ids, startIndex, limit)', 'other.classList.remove("emby-tab-button-active", "Mui-selected", "navMenuOption-selected", "selected", "buttonActive", "pw-watchlist-nav-active")']) {
    if (!script.includes(token)) throw new Error(`Missing client feature: ${token}`);
}
for (const token of ['.pw-watchlist-button', '.pw-watchlist-card-button-adjacent:is(', '.card:hover .pw-watchlist-card-button', '@media (hover: none)', '.pw-watchlist-detail-button.pw-watchlist-active', '.pw-watchlist-route-active .itemsViewSettingsContainer']) {
    if (!style.includes(token)) throw new Error(`Missing stylesheet rule: ${token}`);
}
for (const obsolete of ['function renderWatchlist', 'function watchlistCard', 'function ensureWatchlistCardFooter', 'function normalizeStoredIds', 'pw-watchlist-native-footer', 'pw-watchlist-grid', 'pw-watchlist-item', 'pw-watchlist-card-actions', 'favorite.click()', '#favoritesTab .itemsContainer']) {
    if (script.includes(obsolete) || style.includes(obsolete)) throw new Error(`Custom Watchlist renderer must stay removed: ${obsolete}`);
}

function extractFunction(name) {
    const start = script.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`Missing ${name} implementation.`);
    const bodyStart = script.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < script.length; index++) {
        if (script[index] === '{') depth++;
        if (script[index] === '}' && --depth === 0) {
            const source = script.slice(start, index + 1);
            return new Function(`${source}; return ${name};`)();
        }
    }
    throw new Error(`Could not parse ${name}.`);
}

const nativeWatchlistOptions = extractFunction('nativeWatchlistOptions');
const orderWatchlistResult = extractFunction('orderWatchlistResult');
const shouldUseWatchlistProvider = extractFunction('shouldUseWatchlistProvider');
if (!shouldUseWatchlistProvider(true, true) || shouldUseWatchlistProvider(true, false) || shouldUseWatchlistProvider(false, true)) {
    throw new Error('Standalone Watchlist provider activation failed.');
}
const nativeOptions = nativeWatchlistOptions({ Filters: 'IsFavorite', IsFavorite: true, IncludeItemTypes: 'tag', Tags: 'Watchlist', Limit: 20, SortBy: 'SortName', SortOrder: 'Ascending' }, ['one', 'two']);
if (nativeOptions.Ids !== 'one,two' || nativeOptions.IncludeItemTypes !== 'Movie,Series' || nativeOptions.Limit !== 2 || nativeOptions.StartIndex !== 0 || 'Filters' in nativeOptions || 'IsFavorite' in nativeOptions || 'SortBy' in nativeOptions || 'SortOrder' in nativeOptions || 'Tags' in nativeOptions) {
    throw new Error('Watchlist IDs are not mapped safely into the native Favorites query.');
}
const orderedResult = orderWatchlistResult({ Items: [{ Id: 'old' }, { Id: 'new' }, { Id: 'middle' }] }, ['new', 'middle', 'old'], 0, 2);
if (orderedResult.TotalRecordCount !== 3 || orderedResult.Items.map(item => item.Id).join(',') !== 'new,middle') {
    throw new Error('Watchlist results are not ordered by newest additions before paging.');
}
const normalizeMatch = script.match(/function normalizeId\(value\) \{\s*([\s\S]*?)\n    \}/);
if (!normalizeMatch) throw new Error('Missing normalizeId implementation.');
const normalizeId = new Function('value', normalizeMatch[1]);
const dashedId = '0c23cde7-5a7e-6826-4c8a-375365a6ab17';
const compactId = '0c23cde75a7e68264c8a375365a6ab17';
if (normalizeId(dashedId) !== compactId || normalizeId(compactId) !== compactId) {
    throw new Error('Jellyfin D/N item ID normalization failed.');
}
const regressionIds = new Set([normalizeId(dashedId)]);
const regressionItems = new Map([[normalizeId(compactId), { Id: compactId }]]);
if (!regressionItems.has([...regressionIds][0])) {
    throw new Error('Watchlist IDs no longer resolve to Jellyfin item cache keys.');
}
if (controller.includes('ToString("D")') || !controller.includes('ToString("N")')) {
    throw new Error('Watchlist API must return compact Jellyfin item IDs.');
}
new Function(script);
console.log('PunisherWatchlist web assets validated.');
