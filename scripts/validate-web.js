const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Web', 'punisher-watchlist.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Web', 'punisher-watchlist.css'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src', 'PunisherWatchlist', 'Api', 'WatchlistController.cs'), 'utf8');

for (const token of ['PunisherWatchlist/items', 'pw-watchlist-tab', 'pw-watchlist-card-button', 'pw-watchlist-detail-button', 'MuiAppBar-root', 'favoriteButton', 'pw-watchlist-card-button-adjacent', 'pw-watchlist-drawer-link', 'placeAfterFavorites', 'document.querySelectorAll(".card")', 'localStorageKey', 'pw-watchlist-route-active', 'isLibraryFolderCard', 'updateUserDataFlag', 'pw-watchlist-card-actions', 'cleanAppHashUrl', 'leaveWatchlist', 'state.aliases', 'canonicalKey', 'canonicalClientId', 'normalizeStoredIds']) {
    if (!script.includes(token)) throw new Error(`Missing client feature: ${token}`);
}
for (const token of ['.pw-watchlist-page', '.pw-watchlist-button', '.pw-watchlist-grid', '.pw-watchlist-home-hidden > :not(.pw-watchlist-page)', '.pw-watchlist-card-button-adjacent:is(', '.card:hover .pw-watchlist-card-button', '@media (hover: none)']) {
    if (!style.includes(token)) throw new Error(`Missing stylesheet rule: ${token}`);
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
