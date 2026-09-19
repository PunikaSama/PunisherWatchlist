const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Web', 'punisher-watchlist.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Web', 'punisher-watchlist.css'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Api', 'WatchlistController.cs'), 'utf8');

for (const token of ['PunisherWatchlist/items', 'pw-watchlist-tab', 'pw-watchlist-card-button', 'pw-watchlist-detail-button', 'MuiAppBar-root', 'favoriteButton', 'pw-watchlist-card-button-adjacent', 'pw-watchlist-drawer-link', 'document.querySelectorAll(".card")', 'localStorageKey', 'pw-watchlist-route-active', 'isLibraryFolderCard', 'state.aliases', 'canonicalKey', 'canonicalClientId', 'immediateToggleKey(itemId, button)', 'button.dataset.pwCanonicalId = canonicalKey', 'button.dataset.pwItemType = itemType', 'syncCanonicalButtons(effectiveKey)', 'if (desired) state.ids.delete(effectiveKey); else addNewest(effectiveKey);', '"Season"', 'const seriesId = parentSeriesId(item)', 'state.aliases.set(normalizeId(itemId), seriesId)', 'installNativeItemsProvider', 'api.getItems =', 'function watchlistHash()', 'function isStandaloneWatchlistRoute()', 'type: "tag"', 'IncludeItemTypes: "Movie,Series"', 'container.refreshItems()', 'providerActive: false', 'providerOpening: false', 'state.providerActive = true', 'state.providerOpening)) return original(userId, options);', 'orderWatchlistResult(result, ids, startIndex, limit)', 'queueCardAliasResolution(itemId)', 'await loadItems(ids)', 'ids.forEach(applyCardAlias)', 'refreshCachedWatchlistView()', 'nativeListContainer(page)', 'activeNativeListContainer()', 'if (!state.watchlistOpen || !isStandaloneWatchlistRoute()) return;', 'state.watchlistContainer = visibleContainer', 'refreshOnWatchlistViewShow', 'window.requestAnimationFrame(() => refreshWatchlistView())', 'if (!favorite)', 'tab.remove()', 'favorite.insertAdjacentElement("afterend", tab)', 'other.classList.remove("emby-tab-button-active", "Mui-selected", "navMenuOption-selected", "selected", "buttonActive", "pw-watchlist-nav-active")']) {
    if (!script.includes(token)) throw new Error(`Missing client feature: ${token}`);
}
for (const token of ['.pw-watchlist-button', '.pw-watchlist-card-button-adjacent.pw-watchlist-active', '.pw-watchlist-card-button-fallback.pw-watchlist-active', 'flex: 0 0 2.5rem !important', '.card:hover .pw-watchlist-card-button', '@media (hover: none)', '.pw-watchlist-detail-button.pw-watchlist-active', '.pw-watchlist-route-active .itemsViewSettingsContainer']) {
    if (!style.includes(token)) throw new Error(`Missing stylesheet rule: ${token}`);
}
if (!script.includes('placeCardButton(card, itemId, button)')) {
    throw new Error('Fallback card buttons must move into Jellyfin\'s native action row when it becomes available.');
}
for (const obsolete of ['function renderWatchlist', 'function watchlistCard', 'function ensureWatchlistCardFooter', 'function normalizeStoredIds', 'function placeAfterFavorites', 'pw-watchlist-native-footer', 'pw-watchlist-grid', 'pw-watchlist-item', 'pw-watchlist-card-actions', 'favorite.click()', '#favoritesTab .itemsContainer', 'window.setTimeout(() => refreshWatchlistView(), 250)', 'window.setTimeout(() => refreshWatchlistView(), 700)']) {
    if (script.includes(obsolete) || style.includes(obsolete)) throw new Error(`Custom Watchlist renderer must stay removed: ${obsolete}`);
}
if (style.includes('.pw-watchlist-card-button-adjacent:is(:hover')) {
    throw new Error('Inactive card eyes must not keep the active accent color while hovered.');
}
const toggleSource = script.slice(script.indexOf('async function toggle('), script.indexOf('function updateButton('));
if (toggleSource.indexOf('if (state.watchlistOpen) refreshWatchlistView();') > toggleSource.indexOf('const result = await apiJson(')) {
    throw new Error('The native Watchlist view must refresh before persistence completes.');
}
const openSource = script.slice(script.indexOf('async function openWatchlist()'), script.indexOf('function closeWatchlist('));
if (openSource.indexOf('await refreshCachedWatchlistView()') > openSource.indexOf('location.hash = targetHash.slice(1)')) {
    throw new Error('Cached native Watchlist content must refresh before it becomes visible.');
}
const refreshSource = script.slice(script.indexOf('function refreshWatchlistView('), script.indexOf('async function refreshCachedWatchlistView('));
if (refreshSource.includes('document.querySelectorAll(".mainAnimatedPage:not(.hide) .itemsContainer')) {
    throw new Error('Watchlist refreshes must never target generic visible Home containers.');
}

const synchronizeSource = script.slice(script.indexOf('async function synchronize()'), script.indexOf('function schedule()'));
if (synchronizeSource.indexOf('ensureWatchlistTab();') > synchronizeSource.indexOf('state.api = apiClient();')) {
    throw new Error('Watchlist navigation must render before API initialization.');
}
if (script.includes('window.clearTimeout(state.scheduleTimer)') || !script.includes('if (state.scheduleTimer) return;') || !script.includes('}, 16);')) {
    throw new Error('Navigation synchronization must use the non-starving frame throttle.');
}
if (script.includes('!document.body || !apiClient()')) {
    throw new Error('Initial Watchlist navigation must not wait for the Jellyfin API client.');
}
if (!script.slice(script.indexOf('function start()')).includes('void synchronize();')) {
    throw new Error('Initial Watchlist navigation must synchronize immediately.');
}

function extractFunction(name, dependencies = {}) {
    const start = script.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`Missing ${name} implementation.`);
    const bodyStart = script.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < script.length; index++) {
        if (script[index] === '{') depth++;
        if (script[index] === '}' && --depth === 0) {
            const source = script.slice(start, index + 1);
            return new Function(...Object.keys(dependencies), `${source}; return ${name};`)(...Object.values(dependencies));
        }
    }
    throw new Error(`Could not parse ${name}.`);
}

const nativeWatchlistOptions = extractFunction('nativeWatchlistOptions');
const orderWatchlistResult = extractFunction('orderWatchlistResult');
const shouldUseWatchlistProvider = extractFunction('shouldUseWatchlistProvider');
if (!shouldUseWatchlistProvider(true, true, true, false)
    || !shouldUseWatchlistProvider(true, true, false, true)
    || shouldUseWatchlistProvider(true, true, false, false)
    || shouldUseWatchlistProvider(true, false, true, false)
    || shouldUseWatchlistProvider(false, true, true, false)) {
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
const parentSeriesId = extractFunction('parentSeriesId', { normalizeId });
const immediateToggleKey = extractFunction('immediateToggleKey', { normalizeId });
const dashedId = '0c23cde7-5a7e-6826-4c8a-375365a6ab17';
const compactId = '0c23cde75a7e68264c8a375365a6ab17';
if (normalizeId(dashedId) !== compactId || normalizeId(compactId) !== compactId) {
    throw new Error('Jellyfin D/N item ID normalization failed.');
}
if (parentSeriesId({ Type: 'Episode', SeriesId: dashedId }) !== compactId || parentSeriesId({ Type: 'Series', SeriesId: dashedId }) !== '') {
    throw new Error('Episode cards no longer resolve to their Watchlist series ID.');
}
if (immediateToggleKey(compactId, { dataset: { pwCanonicalId: compactId, pwItemType: 'Series' } }) !== compactId
    || immediateToggleKey('episode', { dataset: { pwCanonicalId: compactId, pwItemType: 'Episode' } }) !== compactId
    || immediateToggleKey('episode', { dataset: { pwCanonicalId: 'episode', pwItemType: 'Episode' } }) !== '') {
    throw new Error('Known Watchlist targets must toggle immediately without metadata loading.');
}
if (/\.pw-watchlist-button\[data-busy="true"\][^{]*\{[^}]*opacity/s.test(style)) {
    throw new Error('Busy Watchlist buttons must not visibly fade during an optimistic toggle.');
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
