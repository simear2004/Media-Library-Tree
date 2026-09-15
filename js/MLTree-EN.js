'use strict';
window.DefinePanel("media library tree", {author: "添加硬件"});
window.DlgCode = 0x0004;
window.DrawMode = 1;

// ========== Win32 Drawing Constants ==========
const DT_LEFT = 0x00000000;
const DT_RIGHT = 0x00000002;
const DT_CENTER = 0x00000001;
const DT_VCENTER = 0x00000004;
const DT_SINGLELINE = 0x00000020;
const DT_NOPREFIX = 0x00000800;
const DT_END_ELLIPSIS = 0x00008000;

// ========== DUI Enums ==========
const ColourTypeDUI = {
	text: 0,
	background: 1,
	highlight: 2,
	selection: 3
};

const FontTypeDUI = {
	playlists: 3
};

// ========== DUI Runtime Variables ==========
let zdpi = 1;                        // DPI scale factor
let g_fname = 'Microsoft YaHei UI';  // base font name

// ========== Configuration ==========
const CONFIG = {
	// ---- Node Layout ----
	itemHeight: 35,
	indentPerLevel: 14,
	sideMarkerWidth: 4,
	sideMarkerHeightRatio: 0.5,

	// ---- Tree Arrow Icon ----
	treeArrowFontName: 'Segoe UI Symbol',
	treeArrowFontSize: 16,
	arrowIconSize: 14,
	arrowIconOffsetX: 5,

	// ---- Search Bar ----
	searchBarHeight: 35,
	searchBarPadding: 8,
	searchTextFontSize: 12,
	searchIconFontSize: 16,
	searchIconFontName: 'Guifx v2 Transports',
	clearBtnFontName: 'Wingdings 2',

	// ---- Track Count ----
	trackCountPadding: 14,
	trackCountOffsetFromRight: 15,

	// ---- Scrollbar ----
	scrollbarWidth: 10,
	scrollbarNarrowWidth: 2,
	scrollbarButtonHeight: 12,
	scrollbarHideDelay: 1500,
	scrollbarCheckExtraWidth: 5,
	minThumbHeight: 20,
	scrollbarArrowFontName: 'Segoe UI Symbol',
	scrollbarArrowFontSize: 10,

	// ---- Behavior ----
	scrollStep: 3,
	loadDelay: 100,

	// ---- Text ----
	loadingText: 'Loading...',
	noDataText: 'No data to display',

	// ---- Names ----
	rootNodeName: 'Media Library',
	rootDirName: '(Root)',
	playlistNameStandard: 'Media Library View',
	playlistNamePlaying: 'Media Library View (Now Playing)',

	// ---- Sorting & Backup ----
	sortFormat: '%path_sort% %album% %album artist%',
	maxUndoBackupCount: 5000
};

const collator = new Intl.Collator(undefined, {
	sensitivity: 'accent',
	numeric: true
});

// ========== State Namespace ==========
const view = {
	w: 0,
	h: 0,
	visibleItems: 0
};

const tree = {
	data: [],
	selected: null,
	byId: new Map(),
	cachedVisible: null,
	cachedVisibleDirty: true
};

const scroll = {
	position: 0,
	hover: false,
	dragging: false,
	dragStartY: 0,
	dragStartScroll: 0,
	active: false,
	minimized: true,
	arrowHover: null,
	arrowDown: null
};

const search = {
	text: '',
	cursorPos: 0,
	cursorVisible: true,
	visibleIds: null,
	inputActive: false,
	start: 0,
	end: 0,
	offset: 0
};

const nowPlaying = {
	node: null,
	trackPath: '',
	nodePath: new Set()
};

const library = {
	root: '',
	handles: null,
	isEmpty: false
};

const ui = {
	isWallpaper: false,
	clearBtnRect: null,
	userSelectingNode: false
};

const cache = {
	countWidths: [],
	needRecalc: false
};

const timers = {
	loading: null,
	scrollbarHide: null,
	userSelecting: null,
	searchCursor: null
};

const theme = {
	textColor: 0,
	bgColor: 0,
	hlColor: 0,
	stColor: 0
};

const fonts = {
	main: null,
	large: null,
	search: null,
	treeArrow: null,
	scrollbarArrow: null,
	searchIcon: null,
	clearBtn: null
};

// ========== Data Structure ==========
function TreeNode(id, name, type, parentId, data) {
	this.id = id;
	this.name = name;
	this.type = type;
	this.parentId = parentId;
	this.data = data || {};
	this.children = [];
	this.expanded = false;
	this.selected = false;
	this.level = 0;
	this.trackCount = 0;
	this.item = [];
	this.searchCount = undefined;
}

// ========== DUI Colors / Fonts ==========
function get_color() {
	theme.textColor = window.GetColourDUI(ColourTypeDUI.text);
	theme.bgColor   = window.GetColourDUI(ColourTypeDUI.background);
	theme.stColor   = window.GetColourDUI(ColourTypeDUI.selection);
	theme.hlColor   = window.GetColourDUI(ColourTypeDUI.highlight);
}

function get_font() {
	let fsize = 12;
	let fstyle = 0;
	try {
		const f = window.GetFontDUI(FontTypeDUI.playlists);
		g_fname = f.Name;
		fsize = f.Size;
		fstyle = f.Style;
	} catch (e) {
		console.log("Font warning: cannot use default font, falling back to Microsoft YaHei UI");
		g_fname = 'Microsoft YaHei UI';
		fsize = 12;
		fstyle = 0;
	}
	zdpi = fsize / 12;
	fonts.main  = gdi.Font(g_fname, fsize, fstyle);
	fonts.large = gdi.Font(g_fname, fsize * 1.35, 2);
}

// ========== DPI Scaling ==========
function applyDpiScaling() {
	const h = window.GetProperty('rowHeight', 35);

	CONFIG.itemHeight                = Math.floor(((h && h > 0) ? h : 35) * zdpi);
	CONFIG.indentPerLevel            = Math.floor(zdpi * 14);
	CONFIG.treeArrowFontSize         = Math.floor(zdpi * 16);
	CONFIG.arrowIconSize             = Math.floor(zdpi * 14);
	CONFIG.arrowIconOffsetX          = Math.floor(zdpi * 5);
	CONFIG.sideMarkerWidth           = Math.floor(zdpi * 4);
	CONFIG.searchBarHeight           = Math.floor(zdpi * 35);
	CONFIG.searchBarPadding          = Math.floor(zdpi * 8);
	CONFIG.searchTextFontSize        = Math.floor(zdpi * 12);
	CONFIG.searchIconFontSize        = Math.floor(zdpi * 16);
	CONFIG.trackCountOffsetFromRight = Math.floor(zdpi * 15);
	CONFIG.trackCountPadding         = Math.floor(zdpi * 14);
	CONFIG.scrollbarWidth            = Math.floor(zdpi * 10);
	CONFIG.scrollbarNarrowWidth      = Math.floor(zdpi * 2);
	CONFIG.scrollbarButtonHeight     = Math.floor(zdpi * 12);
	CONFIG.scrollbarCheckExtraWidth  = Math.floor(zdpi * 5);
	CONFIG.minThumbHeight            = Math.floor(zdpi * 20);
	CONFIG.scrollbarArrowFontSize    = Math.floor(zdpi * 10);

	fonts.treeArrow      = gdi.Font(CONFIG.treeArrowFontName, CONFIG.treeArrowFontSize, 1);
	fonts.scrollbarArrow = gdi.Font(CONFIG.scrollbarArrowFontName, CONFIG.scrollbarArrowFontSize);
	fonts.searchIcon     = gdi.Font(CONFIG.searchIconFontName, CONFIG.searchIconFontSize);
	fonts.clearBtn       = gdi.Font(CONFIG.clearBtnFontName, CONFIG.searchIconFontSize);
}

function recalcCountWidths(gr) {
	let s = '';
	for (let d = 1; d <= 10; d++) {
		s += '9';
		cache.countWidths[d] = gr.CalcTextWidth(s, fonts.main);
	}
}

// ========== Data Loading & Tree Building ==========
function loadFolderTree() {
	tree.data = [];
	tree.byId.clear();
	tree.cachedVisible = null;
	tree.cachedVisibleDirty = true;
	library.isEmpty = false;

	const rootNode = new TreeNode('root', CONFIG.rootNodeName, 'root', null);
	rootNode.expanded = true;
	tree.data.push(rootNode);

	library.handles = fb.GetLibraryItems();
	if (library.handles.Count > 0) {
		const firstPath = library.handles[0].Path;
		if (firstPath) {
			const dir = firstPath.substring(0, firstPath.lastIndexOf('\\'));
			const parts = dir.split('\\');
			library.root = parts.slice(0, -1).join('\\') + '\\';
		}
	}
	const total = library.handles.Count;
	library.isEmpty = (total === 0);

	if (library.isEmpty) {
		tree.byId.set(rootNode.id, rootNode);
		updateScrollbarState();
		window.Repaint();
		return;
	}

	const relativePaths = library.handles.GetLibraryRelativePaths();
	const folderTree = {};

	for (let i = 0; i < total; i++) {
		const relPath = relativePaths[i] || '';
		if (!relPath) {
			if (!folderTree[CONFIG.rootDirName]) folderTree[CONFIG.rootDirName] = {};
			if (!folderTree[CONFIG.rootDirName].__tracks__) folderTree[CONFIG.rootDirName].__tracks__ = [];
			if (!folderTree[CONFIG.rootDirName].__direct_tracks__) folderTree[CONFIG.rootDirName].__direct_tracks__ = [];
			folderTree[CONFIG.rootDirName].__tracks__.push(i);
			folderTree[CONFIG.rootDirName].__direct_tracks__.push(i);
		} else {
			const parts = relPath.split('\\').filter(function(p) { return p; });
			if (parts.length <= 1) {
				if (!folderTree[CONFIG.rootDirName]) folderTree[CONFIG.rootDirName] = {};
				if (!folderTree[CONFIG.rootDirName].__tracks__) folderTree[CONFIG.rootDirName].__tracks__ = [];
				if (!folderTree[CONFIG.rootDirName].__direct_tracks__) folderTree[CONFIG.rootDirName].__direct_tracks__ = [];
				folderTree[CONFIG.rootDirName].__tracks__.push(i);
				folderTree[CONFIG.rootDirName].__direct_tracks__.push(i);
			} else {
				let current = folderTree;
				for (let j = 0; j < parts.length - 1; j++) {
					const part = parts[j];
					if (!current[part]) current[part] = {};
					if (!current[part].__tracks__) current[part].__tracks__ = [];
					current = current[part];
					current.__tracks__.push(i);
					if (j === parts.length - 2) {
						if (!current.__direct_tracks__) current.__direct_tracks__ = [];
						current.__direct_tracks__.push(i);
					}
				}
			}
		}
	}

	createFolderNodesFromTree(folderTree, rootNode, '');

	rootNode.trackCount = library.handles ? library.handles.Count : 0;
	rootNode.name = CONFIG.rootNodeName + ' (' + rootNode.children.length + ' folders)';

	for (let k = 0; k < tree.data.length; k++) {
		tree.byId.set(tree.data[k].id, tree.data[k]);
	}
}

function createFolderNodesFromTree(nodeTree, parentNode, currentPath) {
	const keys = Object.keys(nodeTree).filter(function(k) { return k !== '__tracks__' && k !== '__direct_tracks__'; });
	keys.sort(function(a, b) { return collator.compare(a, b); });

	for (let i = 0; i < keys.length; i++) {
		const folderName = keys[i];
		const fullPath = currentPath ? currentPath + '\\' + folderName : folderName;
		const node = new TreeNode('folder_' + fullPath, folderName, 'folder', parentNode.id);
		node.data.path = fullPath;
		node.data.fullPath = fullPath;
		parentNode.children.push(node);
		tree.data.push(node);
		createFolderNodesFromTree(nodeTree[folderName], node, fullPath);

		const tracks = nodeTree[folderName].__tracks__ || [];
		node.trackCount = tracks.length;

		if (tracks.length > 0) {
			const sortedTracks = tracks.slice().sort(function(a, b) { return a - b; });
			let start = sortedTracks[0];
			let end = sortedTracks[0];
			for (let ti = 1; ti < sortedTracks.length; ti++) {
				if (sortedTracks[ti] === end + 1) {
					end = sortedTracks[ti];
				} else {
					node.item.push({start: start, end: end});
					start = sortedTracks[ti];
					end = sortedTracks[ti];
				}
			}
			node.item.push({start: start, end: end});
		}

		const directTracks = nodeTree[folderName].__direct_tracks__ || [];

		if (directTracks.length > 0) {
			const decorated = directTracks.map(function(t) {
				const h = library.handles[t];
				const p = h.Path;
				return {
					idx: t,
					name: p.substring(p.lastIndexOf('\\') + 1),
					raw: h.RawPath || ''
				};
			});
			decorated.sort(function(a, b) {
				if (a.name !== b.name) return collator.compare(a.name, b.name);
				return a.raw.localeCompare(b.raw);
			});

			for (let j = 0; j < decorated.length; j++) {
				const trackIndex = decorated[j].idx;
				const handle = library.handles[trackIndex];
				const trackPath = handle.Path;
				const subSong = handle.SubSong || 0;
				const trackId = subSong > 0 ? 'track_' + trackPath + '_' + subSong : 'track_' + trackPath;
				let trackName = trackPath.substring(trackPath.lastIndexOf('\\') + 1);
				if (subSong > 0) {
					const tfo = fb.TitleFormat('%tracknumber% - %title%');
					trackName = tfo.EvalWithMetadb(handle);
				}
				const trackNode = new TreeNode(trackId, trackName, 'track', node.id);
				trackNode.data.path = trackPath;
				trackNode.data.handleIndex = trackIndex;
				trackNode.data.subSong = subSong;
				node.children.push(trackNode);
				tree.data.push(trackNode);
			}
		}
	}
}

// ========== Visibility & Caching ==========
function recalcVisibleItems() {
	const treeAreaHeight = view.h - CONFIG.searchBarHeight;
	view.visibleItems = Math.max(1, Math.floor(treeAreaHeight / CONFIG.itemHeight));
}

function invalidateVisibleNodesCache() {
	tree.cachedVisibleDirty = true;
}

function traverseVisibleNodes(list, level, result, filterIds) {
	for (const node of list) {
		if (filterIds && !filterIds.has(node.id)) continue;
		node.level = level;
		result.push(node);
		if (node.expanded && node.children.length) {
			traverseVisibleNodes(node.children, level + 1, result, filterIds);
		}
	}
}

function getVisibleNodes() {
	if (search.text && search.visibleIds) {
		const result = [];
		if (tree.data.length) traverseVisibleNodes([tree.data[0]], 0, result, search.visibleIds);
		return result;
	}
	if (tree.cachedVisibleDirty || !tree.cachedVisible) {
		tree.cachedVisible = [];
		if (tree.data.length) traverseVisibleNodes([tree.data[0]], 0, tree.cachedVisible, null);
		tree.cachedVisibleDirty = false;
	}
	return tree.cachedVisible;
}

// ========== Search ==========
function markSearchVisible(node, searchLower) {
	let matchCount = 0;
	const nameMatch = node.name.toLowerCase().indexOf(searchLower) !== -1;

	if (node.type === 'track') {
		matchCount = nameMatch ? 1 : 0;
	} else {
		for (let i = 0; i < node.children.length; i++) {
			matchCount += markSearchVisible(node.children[i], searchLower);
		}
	}

	if (nameMatch || matchCount > 0) {
		search.visibleIds.add(node.id);
		node.searchCount = matchCount;
		return matchCount;
	}
	return 0;
}

function performSearch() {
	if (!search.text) {
		for (let i = 0; i < tree.data.length; i++) {
			tree.data[i].searchCount = undefined;
		}
		search.visibleIds = null;
		tree.cachedVisibleDirty = true;
		updateScrollbarState();
		return;
	}

	const searchLower = search.text.toLowerCase();
	search.visibleIds = new Set();

	if (tree.data.length > 0) {
		markSearchVisible(tree.data[0], searchLower);
	}

	tree.cachedVisibleDirty = true;
	updateScrollbarState();
}

function clearSearch() {
	search.text = '';
	search.cursorPos = 0;
	search.start = 0;
	search.end = 0;
	search.offset = 0;
	for (let i = 0; i < tree.data.length; i++) {
		tree.data[i].searchCount = undefined;
	}
	search.visibleIds = null;
	tree.cachedVisibleDirty = true;
	scroll.position = 0;
	updateScrollbarState();
	window.Repaint();
}

function toggleSearchCursor() {
	search.cursorVisible = !search.cursorVisible;
	window.RepaintRect(0, 0, view.w, CONFIG.searchBarHeight, true);
}

function startSearchCursorBlink() {
	search.cursorVisible = true;
	if (timers.searchCursor) window.ClearTimeout(timers.searchCursor);
	timers.searchCursor = window.SetInterval(function() {
		toggleSearchCursor();
	}, 500);
}

function stopSearchCursorBlink() {
	if (timers.searchCursor) {
		window.ClearInterval(timers.searchCursor);
		timers.searchCursor = null;
	}
}

// ========== Drawing Functions ==========
function drawSearchbar(gr) {
	const searchBgColor = search.inputActive
		? ((theme.textColor & 0x00ffffff) | 0x20000000)
		: ((theme.textColor & 0x00ffffff) | 0x0C000000);
	gr.FillSolidRect(0, 0, view.w, CONFIG.searchBarHeight, searchBgColor);

	const sepColor = (theme.textColor & 0x00ffffff) | 0x10ffffff;
	gr.FillSolidRect(0, CONFIG.searchBarHeight - 1, view.w, 1, sepColor);

	const paddingX = CONFIG.searchBarPadding;

	const iconColor = search.inputActive ? theme.textColor : ((theme.textColor & 0x00ffffff) | 0x60000000);
	const iconWidth = gr.CalcTextWidth(')', fonts.searchIcon) + 4;
	gr.GdiDrawText(')', fonts.searchIcon, iconColor,
		paddingX + 2, 0, iconWidth, CONFIG.searchBarHeight,
		DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);

	let textStartX = paddingX + iconWidth + 4;
	let textRectW = view.w - textStartX - paddingX;

	if (search.text) {
		const clearBtnW = gr.CalcTextWidth(String.fromCharCode(0xF0CE), fonts.clearBtn) + 8;
		const clearBtnX = view.w - paddingX - clearBtnW;
		ui.clearBtnRect = { x: clearBtnX, y: 0, w: clearBtnW, h: CONFIG.searchBarHeight };
		textRectW = clearBtnX - textStartX - 4;
		gr.GdiDrawText(String.fromCharCode(0xF0CE), fonts.clearBtn, iconColor,
			clearBtnX, 0, clearBtnW, CONFIG.searchBarHeight,
			DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
	} else {
		ui.clearBtnRect = null;
	}

	if (search.text) {
		const displayText = search.text.substring(search.offset);
		gr.GdiDrawText(displayText, fonts.main, theme.textColor,
			textStartX, 0, textRectW, CONFIG.searchBarHeight,
			DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
	} else if (!search.inputActive) {
		const placeholderColor = (theme.textColor & 0x00ffffff) | 0x40000000;
		gr.GdiDrawText('Search', fonts.main, placeholderColor,
			textStartX, 0, textRectW, CONFIG.searchBarHeight,
			DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
	}

	if (search.inputActive && search.cursorVisible && search.start == search.end) {
		const cursorText = search.text.substring(search.offset, search.cursorPos);
		const cursorX = textStartX + gr.CalcTextWidth(cursorText, fonts.main);
		const cursorHeight = Math.min(CONFIG.searchBarHeight - 10, CONFIG.searchTextFontSize);
		const cursorY = Math.floor((CONFIG.searchBarHeight - cursorHeight) / 2);
		gr.DrawLine(cursorX, cursorY, cursorX, cursorY + cursorHeight, 1, theme.textColor);
	}
}

function drawTreeNode(gr, node, yPos, rowIndex) {
	if (!node) return;
	const effectiveLevel = node.level <= 1 ? 0 : node.level - 1;
	const isEvenRow = rowIndex % 2 === 0;
	const isNowPlaying = nowPlaying.nodePath.has(node.id);

	let rowBgColor = 0;
	let focusBorderColor = 0;

	if (node.selected) {
		rowBgColor = theme.stColor & 0x3cffffff;
		focusBorderColor = theme.stColor & 0x4bffffff;
	} else if (isNowPlaying) {
		rowBgColor = theme.stColor & 0x35ffffff;
	} else if (isEvenRow) {
		rowBgColor = theme.textColor & 0x05ffffff;
	}

	const rowTextColor = node.selected
		? (theme.hlColor & 0xbfffffff)
		: (isNowPlaying ? theme.hlColor : theme.textColor);

	if (rowBgColor !== 0) {
		gr.FillSolidRect(0, yPos, view.w, CONFIG.itemHeight, rowBgColor);
	}

	if (focusBorderColor !== 0) {
		gr.DrawRect(0, yPos, view.w - 1, CONFIG.itemHeight - 1, 1.0, focusBorderColor);
	}

	if (isNowPlaying) {
		const markerH = Math.floor(CONFIG.itemHeight * CONFIG.sideMarkerHeightRatio);
		const markerY = yPos + Math.floor((CONFIG.itemHeight - markerH) / 2);
		gr.FillSolidRect(0, markerY, CONFIG.sideMarkerWidth, markerH, theme.hlColor);
	}

	const arrowX = CONFIG.sideMarkerWidth + CONFIG.arrowIconOffsetX + effectiveLevel * CONFIG.indentPerLevel;
	let textX;

	if (node.type === 'folder' && node.children.length > 0) {
		const iconText = node.expanded ? 'v' : '>';
		gr.GdiDrawText(iconText, fonts.main, rowTextColor,
			arrowX, yPos, CONFIG.arrowIconSize, CONFIG.itemHeight,
			DT_LEFT | DT_VCENTER | DT_SINGLELINE);
		textX = arrowX + CONFIG.arrowIconSize;
	} else if (node.type === 'track') {
		gr.GdiDrawText('\u266A', fonts.main, rowTextColor,
			arrowX, yPos, CONFIG.arrowIconSize, CONFIG.itemHeight,
			DT_LEFT | DT_VCENTER | DT_SINGLELINE);
		textX = arrowX + CONFIG.arrowIconSize;
	} else {
		textX = arrowX;
	}

	let countText = "";
	let countWidth = 0;
	let countValue = node.trackCount;
	if (search.text && typeof node.searchCount === 'number') {
		countValue = node.searchCount;
	}
	if (countValue > 0) {
		countText = String(countValue);
		countWidth = cache.countWidths[countText.length] || 0;
		if (countWidth === 0) {
			countWidth = gr.CalcTextWidth(countText, fonts.main);
		}
	}

	const countRight = view.w - CONFIG.trackCountOffsetFromRight;
	const nameRight = (countWidth > 0)
		? (countRight - countWidth - CONFIG.trackCountPadding)
		: countRight;
	const textWidth = nameRight - textX;

	gr.GdiDrawText(node.name, fonts.main, rowTextColor, textX, yPos, textWidth, CONFIG.itemHeight,
		DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS | DT_NOPREFIX);

	if (countWidth > 0) {
		gr.GdiDrawText(countText, fonts.main, rowTextColor,
			countRight - countWidth, yPos,
			countWidth + 2, CONFIG.itemHeight,
			DT_LEFT | DT_VCENTER | DT_SINGLELINE);
	}
}

function getArrowColor(name) {
	if (scroll.arrowDown === name)  return theme.textColor;
	if (scroll.arrowHover === name) return theme.textColor & 0x99ffffff;
	return theme.textColor & 0x55ffffff;
}

function drawScrollbar(gr) {
	const m = getScrollbarMetrics();
	if (!m) return;

	let currentWidth = scroll.minimized ? CONFIG.scrollbarNarrowWidth : CONFIG.scrollbarWidth;
	const actualX = view.w - currentWidth;
	const trackTop = CONFIG.searchBarHeight;
	const trackH = view.h - trackTop;

	if (currentWidth > CONFIG.scrollbarNarrowWidth) {
		gr.FillSolidRect(actualX, trackTop, currentWidth, trackH, theme.textColor & 0x15ffffff);

		gr.GdiDrawText('▲', fonts.scrollbarArrow, getArrowColor('up'),
			actualX, trackTop, currentWidth, CONFIG.scrollbarButtonHeight,
			DT_CENTER | DT_VCENTER | DT_SINGLELINE);
		gr.GdiDrawText('▼', fonts.scrollbarArrow, getArrowColor('down'),
			actualX, view.h - CONFIG.scrollbarButtonHeight, currentWidth, CONFIG.scrollbarButtonHeight,
			DT_CENTER | DT_VCENTER | DT_SINGLELINE);
	}

	let thumbColor;
	if (scroll.dragging) thumbColor = theme.textColor & 0x99ffffff;
	else if (scroll.hover) thumbColor = theme.textColor & 0x55ffffff;
	else thumbColor = theme.textColor & 0x33ffffff;

	gr.FillSolidRect(actualX, m.thumbY, currentWidth, m.thumbHeight, thumbColor);
}

// ========== Scrollbar Logic ==========
function updateScrollbarState() {
	const visibleNodes = getVisibleNodes();
	const maxScroll = Math.max(0, visibleNodes.length - view.visibleItems);
	scroll.active = maxScroll > 0;
}

function getScrollbarMetrics() {
	const visibleNodes = getVisibleNodes();
	const maxScroll = Math.max(0, visibleNodes.length - view.visibleItems);
	if (maxScroll <= 0) return null;

	const trackTop = CONFIG.searchBarHeight;
	const trackHeight = view.h - trackTop;
	const usable = trackHeight - CONFIG.scrollbarButtonHeight * 2;
	if (usable <= 0) return null;

	const scrollRatio = scroll.position / maxScroll;
	const visibleRatio = view.visibleItems / visibleNodes.length;
	const thumbHeight = Math.max(CONFIG.minThumbHeight, usable * visibleRatio);
	const thumbTravel = Math.max(0, usable - thumbHeight);
	const thumbY = trackTop + CONFIG.scrollbarButtonHeight + scrollRatio * thumbTravel;

	return { maxScroll, scrollRatio, thumbHeight, thumbTravel, thumbY, visibleNodes };
}

function getScrollbarThumbRect() {
	const m = getScrollbarMetrics();
	if (!m) return null;

	let currentWidth = scroll.minimized ? CONFIG.scrollbarNarrowWidth : CONFIG.scrollbarWidth;
	return { x: view.w - currentWidth, y: m.thumbY, w: currentWidth, h: m.thumbHeight };
}

function isOnScrollbarButton(y) {
	if (y < CONFIG.searchBarHeight) return null;
	if (y < CONFIG.searchBarHeight + CONFIG.scrollbarButtonHeight) return 'up';
	if (y > view.h - CONFIG.scrollbarButtonHeight) return 'down';
	return null;
}

function isMouseOnScrollbarArea(x, y) {
	if (!scroll.active) return false;
	if (y < CONFIG.searchBarHeight) return false;
	const currentWidth = scroll.minimized ? CONFIG.scrollbarNarrowWidth : CONFIG.scrollbarWidth;
	const checkWidth = currentWidth + CONFIG.scrollbarCheckExtraWidth;
	return x >= view.w - checkWidth && x < view.w && y < view.h;
}

function startScrollbarHideTimer() {
	if (timers.scrollbarHide) window.ClearTimeout(timers.scrollbarHide);
	timers.scrollbarHide = window.SetTimeout(function() {
		if (!scroll.dragging && !scroll.hover) {
			scroll.minimized = true;
			window.Repaint();
		}
		timers.scrollbarHide = null;
	}, CONFIG.scrollbarHideDelay);
}

function handleScrollbarClick(x, y) {
	const button = isOnScrollbarButton(y);
	if (button && scroll.active) {
		const visibleNodes = getVisibleNodes();
		const maxScroll = Math.max(0, visibleNodes.length - view.visibleItems);
		scroll.position = button === 'up'
			? Math.max(0, Math.floor(scroll.position) - 1)
			: Math.min(maxScroll, Math.floor(scroll.position) + 1);
		window.Repaint();
		return true;
	}

	const thumbRect = getScrollbarThumbRect();
	if (thumbRect && x >= thumbRect.x && x <= thumbRect.x + thumbRect.w &&
		y >= thumbRect.y && y <= thumbRect.y + thumbRect.h) {
		scroll.dragging = true;
		scroll.minimized = false;
		scroll.dragStartY = y;
		scroll.dragStartScroll = scroll.position;
		window.Repaint();
		return true;
	}

	return true;
}

// ========== Playback & Selection ==========
function collectTracksFromNode(node) {
	const handles = fb.CreateHandleList();
	if (!library.handles) return handles;

	if (node.type === 'track') {
		const idx = node.data.handleIndex;
		if (idx !== undefined && idx < library.handles.Count) {
			handles.Add(library.handles[idx]);
		}
		return handles;
	}

	if (node.type === 'folder') {
		for (let i = 0; i < node.item.length; i++) {
			const r = node.item[i];
			const s = r.start < r.end ? r.start : r.end;
			const e = r.start < r.end ? r.end : r.start;
			for (let j = s; j <= e; j++) {
				if (j < library.handles.Count) handles.Add(library.handles[j]);
			}
		}
	}
	return handles;
}

function playSingleTrack(node) {
	if (!plman || !fb || node.type !== 'track') return;
	const handle = collectTracksFromNode(node);
	if (handle.Count === 0) return;

	const pl_stnd_idx = plman.FindOrCreatePlaylist(CONFIG.playlistNameStandard, false);
	if (pl_stnd_idx === -1) return;

	if (plman.PlaylistItemCount(pl_stnd_idx) < CONFIG.maxUndoBackupCount) plman.UndoBackup(pl_stnd_idx);
	plman.ClearPlaylist(pl_stnd_idx);
	plman.InsertPlaylistItems(pl_stnd_idx, 0, handle, false);
	plman.SetPlaylistFocusItem(pl_stnd_idx, 0);
	plman.ClearPlaylistSelection(pl_stnd_idx);
	plman.SetPlaylistSelectionSingle(pl_stnd_idx, 0, true);
	plman.EnsurePlaylistItemVisible(pl_stnd_idx, 0);
	plman.ActivePlaylist = pl_stnd_idx;
	plman.StopAfterCurrent = false;
	plman.ExecutePlaylistDefaultAction(pl_stnd_idx, 0);
}

function isNowPlayingInNode(node) {
	if (!fb.IsPlaying) return false;
	const handle = fb.GetNowPlaying();
	if (!handle) return false;
	const path = handle.Path;
	if (!path) return false;
	const folderPath = node.data.path;
	let relative = '';
	if (path.indexOf(library.root) === 0) {
		relative = path.substring(library.root.length);
		if (relative.charAt(0) === '\\') relative = relative.substring(1);
		const lastSlash = relative.lastIndexOf('\\');
		if (lastSlash !== -1) relative = relative.substring(0, lastSlash);
		else relative = '';
	}
	return relative === folderPath || (relative.indexOf(folderPath + '\\') === 0);
}

function inRange(num, items) {
	let lo = 0, hi = items.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const it = items[mid];
		const s = it.start < it.end ? it.start : it.end;
		const e = it.start < it.end ? it.end : it.start;
		if (num < s) hi = mid - 1;
		else if (num > e) lo = mid + 1;
		else return true;
	}
	return false;
}

function findNodeByHandleIndex(npIndex) {
	const visibleNodes = getVisibleNodes();
	for (let i = visibleNodes.length - 1; i >= 0; i--) {
		const node = visibleNodes[i];
		if (node.type === 'folder' && node.item.length > 0 && inRange(npIndex, node.item)) {
			return node;
		}
	}
	return null;
}

function scrollToNode(targetNode, center) {
	if (!targetNode) return;

	const visibleNodes = getVisibleNodes();
	let targetIndex = -1;
	for (let i = 0; i < visibleNodes.length; i++) {
		if (visibleNodes[i] === targetNode) {
			targetIndex = i;
			break;
		}
	}
	if (targetIndex === -1) return;

	if (center) {
		const centerOffset = Math.round(view.visibleItems / 2 - 1);
		scroll.position = Math.max(0, targetIndex - centerOffset);
	} else {
		const topIndex = scroll.position;
		const bottomIndex = scroll.position + view.visibleItems - 1;
		if (targetIndex < topIndex) {
			scroll.position = targetIndex;
		} else if (targetIndex > bottomIndex) {
			scroll.position = targetIndex - view.visibleItems + 1;
		}
	}
	const maxScroll = Math.max(0, visibleNodes.length - view.visibleItems);
	scroll.position = Math.min(scroll.position, maxScroll);
}

function updateNowPlayingNode() {
	if (!fb.IsPlaying) {
		nowPlaying.nodePath.clear();
		nowPlaying.node = null;
		nowPlaying.trackPath = '';
		return;
	}
	const handle = fb.GetNowPlaying();
	if (!handle) return;
	const path = handle.Path;
	if (!path) return;
	if (!library.handles) return;
	const npIndex = library.handles.Find(handle);
	if (npIndex === -1) return;

	let foundNode = null;
	for (let i = tree.data.length - 1; i >= 0; i--) {
		const node = tree.data[i];
		if (node.type === 'folder' && !node.root && node.item.length > 0 && inRange(npIndex, node.item)) {
			foundNode = node;
			break;
		}
	}
	if (!foundNode) return;

	nowPlaying.nodePath.clear();
	nowPlaying.node = null;
	nowPlaying.trackPath = '';

	nowPlaying.trackPath = path;
	nowPlaying.node = foundNode;

	nowPlaying.nodePath.add(foundNode.id);

	for (let j = 0; j < foundNode.children.length; j++) {
		const child = foundNode.children[j];
		if (child.type === 'track' && child.data.handleIndex === npIndex) {
			nowPlaying.nodePath.add(child.id);
			break;
		}
	}

	let parentId = foundNode.parentId;
	while (parentId) {
		const parent = findNodeById(parentId);
		if (parent) {
			if (parent.type !== 'root') nowPlaying.nodePath.add(parent.id);
			parentId = parent.parentId;
		} else break;
	}
}

function sendTracksToPlaylist(node) {
	if (!plman) return;
	if (!fb || !fb.GetLibraryItems) return;

	const handles = collectTracksFromNode(node);
	if (handles.Count === 0) return;

	const tfo = fb.TitleFormat(CONFIG.sortFormat);
	handles.OrderByFormat(tfo, 1);

	const pl_stnd_idx = plman.FindOrCreatePlaylist(CONFIG.playlistNameStandard, true);
	const isPlayingHere = isNowPlayingInNode(node);

	if (fb.IsPlaying && !isPlayingHere) {
		const pl_playing_idx = plman.FindOrCreatePlaylist(CONFIG.playlistNamePlaying, false);

		if (plman.PlayingPlaylist == pl_stnd_idx) {
			plman.RenamePlaylist(pl_stnd_idx, CONFIG.playlistNamePlaying);
			plman.RenamePlaylist(pl_playing_idx, CONFIG.playlistNameStandard);

			const count = plman.PlaylistItemCount(pl_playing_idx);
			const indices = [];
			for (let i = 0; i < count; i++) indices.push(i);
			plman.SetPlaylistSelection(pl_playing_idx, indices, true);
			plman.RemovePlaylistSelection(pl_playing_idx, false);
			plman.InsertPlaylistItems(pl_playing_idx, 0, handles, false);

			plman.MovePlaylist(pl_playing_idx, pl_stnd_idx);
			plman.MovePlaylist(pl_stnd_idx + 1, pl_playing_idx);
		} else {
			const count = plman.PlaylistItemCount(pl_stnd_idx);
			const indices = [];
			for (let i = 0; i < count; i++) indices.push(i);
			plman.SetPlaylistSelection(pl_stnd_idx, indices, true);
			plman.RemovePlaylistSelection(pl_stnd_idx, false);
			plman.InsertPlaylistItems(pl_stnd_idx, 0, handles, false);
		}
		plman.ActivePlaylist = pl_stnd_idx;
	} else if (fb.IsPlaying && isPlayingHere) {
		const np = fb.GetNowPlaying();
		if (np) {
			const pos = handles.Find(np);
			if (pos !== -1) {
				resetPlaylist(pl_stnd_idx, handles, pos);
			} else {
				resetPlaylist(pl_stnd_idx, handles, 0);
			}
		}
	} else {
		resetPlaylist(pl_stnd_idx, handles, 0);
	}
}

function resetPlaylist(pl_idx, handles, focusPos) {
	if (plman.PlaylistItemCount(pl_idx) < CONFIG.maxUndoBackupCount) plman.UndoBackup(pl_idx);
	plman.ClearPlaylist(pl_idx);
	plman.InsertPlaylistItems(pl_idx, 0, handles, false);
	if (focusPos !== undefined) {
		plman.SetPlaylistFocusItem(pl_idx, focusPos);
		plman.ClearPlaylistSelection(pl_idx);
		plman.SetPlaylistSelectionSingle(pl_idx, focusPos, true);
		plman.EnsurePlaylistItemVisible(pl_idx, focusPos);
	} else {
		plman.SetPlaylistFocusItem(pl_idx, 0);
	}
	plman.ActivePlaylist = pl_idx;
}

function locateCurrentTrack() {
	if (!fb.IsPlaying) return;
	updateNowPlayingNode();
	if (!nowPlaying.node) return;

	const visibleTarget = getVisibleAncestor(nowPlaying.node);

	if (tree.selected) tree.selected.selected = false;
	if (visibleTarget) {
		visibleTarget.selected = true;
		tree.selected = visibleTarget;
	}

	scrollToNode(visibleTarget, true);
	window.Repaint();

	const pl_playing_idx = plman.FindOrCreatePlaylist(CONFIG.playlistNamePlaying, false);
	if (pl_playing_idx !== -1) {
		const np = fb.GetNowPlaying();
		if (np) {
			const handles = plman.GetPlaylistItems(pl_playing_idx);
			const pos = handles.Find(np);
			if (pos !== -1) {
				plman.ActivePlaylist = pl_playing_idx;
				plman.SetPlaylistFocusItem(pl_playing_idx, pos);
				plman.ClearPlaylistSelection(pl_playing_idx);
				plman.SetPlaylistSelectionSingle(pl_playing_idx, pos, true);
				plman.EnsurePlaylistItemVisible(pl_playing_idx, pos);
			}
		}
	}
}

function sendToCurrentPlaylist(node) {
	if (!plman) return;
	const handles = collectTracksFromNode(node);
	if (handles.Count === 0) return;

	const tfo = fb.TitleFormat(CONFIG.sortFormat);
	handles.OrderByFormat(tfo, 1);

	const activeIdx = plman.ActivePlaylist;
	if (plman.PlaylistItemCount(activeIdx) < CONFIG.maxUndoBackupCount) plman.UndoBackup(activeIdx);
	plman.ClearPlaylist(activeIdx);
	plman.InsertPlaylistItems(activeIdx, 0, handles, false);
	plman.SetPlaylistFocusItem(activeIdx, 0);
	plman.ClearPlaylistSelection(activeIdx);
	plman.SetPlaylistSelectionSingle(activeIdx, 0, true);
	plman.EnsurePlaylistItemVisible(activeIdx, 0);
	plman.StopAfterCurrent = false;
	fb.Play();
}

function addToCurrentPlaylist(node) {
	if (!plman) return;
	const handles = collectTracksFromNode(node);
	if (handles.Count === 0) return;

	const activeIdx = plman.ActivePlaylist;
	if (plman.PlaylistItemCount(activeIdx) < CONFIG.maxUndoBackupCount) plman.UndoBackup(activeIdx);
	plman.InsertPlaylistItems(activeIdx, plman.PlaylistItemCount(activeIdx), handles, false);
}

function sendToNewPlaylist(node) {
	if (!plman) return;
	const handles = collectTracksFromNode(node);
	if (handles.Count === 0) return;

	const tfo = fb.TitleFormat(CONFIG.sortFormat);
	handles.OrderByFormat(tfo, 1);

	const plIdx = plman.CreatePlaylist(plman.PlaylistCount, node.name);
	plman.InsertPlaylistItems(plIdx, 0, handles, false);
	plman.SetPlaylistFocusItem(plIdx, 0);
	plman.ClearPlaylistSelection(plIdx);
	plman.SetPlaylistSelectionSingle(plIdx, 0, true);
	plman.EnsurePlaylistItemVisible(plIdx, 0);
	plman.ActivePlaylist = plIdx;
	plman.StopAfterCurrent = false;
	fb.Play();
}

function collapseAll() {
	for (let i = 0; i < tree.data.length; i++) {
		if (tree.data[i].type === 'folder') {
			tree.data[i].expanded = false;
		}
	}
	invalidateVisibleNodesCache();
	scroll.position = 0;
	updateScrollbarState();
	window.Repaint();
}

function expandNodeRecursive(node) {
	if (node.type === 'folder' || node.type === 'root') {
		node.expanded = true;
		for (let i = 0; i < node.children.length; i++) {
			expandNodeRecursive(node.children[i]);
		}
	}
}

function expandAll() {
	if (tree.data.length > 0) expandNodeRecursive(tree.data[0]);
	invalidateVisibleNodesCache();
	updateScrollbarState();
	window.Repaint();
}

// ========== Utility Functions ==========
function findNodeById(id) {
	return tree.byId.get(id) || null;
}

function getVisibleAncestor(node) {
	if (!node) return null;
	let visible = node;
	let p = node;
	while (p && p.type !== 'root') {
		if (!p.expanded) {
			visible = p;
		}
		p = findNodeById(p.parentId);
	}
	return visible;
}

// ========== Refresh ==========
function scheduleTreeLoad() {
	if (timers.loading) window.ClearTimeout(timers.loading);
	timers.loading = window.SetTimeout(function() {
		loadFolderTree();
		if (search.text) performSearch();
		updateNowPlayingNode();
		updateScrollbarState();
		window.Repaint();
		timers.loading = null;
	}, CONFIG.loadDelay);
}

function refresh() {
	tree.selected = null;
	nowPlaying.node = null;
	nowPlaying.trackPath = '';
	nowPlaying.nodePath.clear();
	scroll.position = 0;
	library.isEmpty = false;
	scheduleTreeLoad();
}

// ========== Event Callbacks ==========
function on_size() {
	view.w = window.Width;
	view.h = window.Height;
	recalcVisibleItems();
	updateScrollbarState();
}

function on_paint(gr) {
	if (!gr) return;
	gr.FillSolidRect(0, 0, view.w, view.h, theme.bgColor);

	drawSearchbar(gr);

	if (!tree.data || tree.data.length === 0) {
		gr.GdiDrawText(CONFIG.loadingText, fonts.main, theme.textColor,
			10, CONFIG.searchBarHeight + 10, view.w - 20, 30, 0);
		return;
	}
	if (library.isEmpty) {
		const hint1 = 'Media library is empty';
		const hint2 = 'Click here to add a media library';
		const y1 = CONFIG.searchBarHeight + (view.h - CONFIG.searchBarHeight) / 2 - 30;
		const y2 = CONFIG.searchBarHeight + (view.h - CONFIG.searchBarHeight) / 2 + 10;
		gr.GdiDrawText(hint1, fonts.large, theme.textColor, 0, y1, view.w, 30, DT_CENTER | DT_SINGLELINE);
		gr.GdiDrawText(hint2, fonts.large, theme.hlColor, 0, y2, view.w, 30, DT_CENTER | DT_SINGLELINE);
		return;
	}

	if (cache.needRecalc && fonts.main) {
		recalcCountWidths(gr);
		cache.needRecalc = false;
	}

	const visibleNodes = getVisibleNodes();
	const maxScroll = Math.max(0, visibleNodes.length - view.visibleItems);
	scroll.position = Math.min(scroll.position, maxScroll);
	const startIndex = Math.min(scroll.position, Math.max(0, visibleNodes.length - view.visibleItems));
	const nodesToDraw = Math.min(view.visibleItems, visibleNodes.length - startIndex);
	const nodesToShow = visibleNodes.slice(startIndex, startIndex + nodesToDraw);
	for (let i = 0; i < nodesToShow.length; i++) {
		drawTreeNode(gr, nodesToShow[i], CONFIG.searchBarHeight + i * CONFIG.itemHeight, startIndex + i);
	}
	drawScrollbar(gr);
	if (visibleNodes.length === 0) {
		gr.GdiDrawText(search.text ? 'No matches found' : CONFIG.noDataText, fonts.main, theme.textColor,
			10, CONFIG.searchBarHeight + 10, view.w - 20, 30, 0);
	}
}

function on_mouse_lbtn_down(x, y) {
	if (y < 0) return;

	if (y >= CONFIG.searchBarHeight) {
		const currScrollbarWidth = scroll.minimized ? CONFIG.scrollbarNarrowWidth : CONFIG.scrollbarWidth;
		if (x >= view.w - currScrollbarWidth - CONFIG.scrollbarCheckExtraWidth) {
			const btn = isOnScrollbarButton(y);
			if (btn) scroll.arrowDown = btn;
			handleScrollbarClick(x, y);
			return;
		}
	}

	if (y < CONFIG.searchBarHeight) {
		if (ui.clearBtnRect && x >= ui.clearBtnRect.x && x <= ui.clearBtnRect.x + ui.clearBtnRect.w) {
			clearSearch();
			search.inputActive = false;
			stopSearchCursorBlink();
			search.cursorVisible = false;
			ui.clearBtnRect = null;
			window.RepaintRect(0, 0, view.w, CONFIG.searchBarHeight, true);
			return;
		}
		search.inputActive = true;
		search.cursorPos = search.text.length;
		search.start = search.cursorPos;
		search.end = search.cursorPos;
		search.offset = 0;
		startSearchCursorBlink();
		window.Repaint();
		return;
	}

	search.inputActive = false;
	stopSearchCursorBlink();

	if (library.isEmpty) {
		if (fb && fb.RunMainMenuCommand) {
			fb.RunMainMenuCommand('Library/Configure');
		}
		return;
	}

	const adjustedY = y - CONFIG.searchBarHeight;
	const itemIndex = Math.floor(adjustedY / CONFIG.itemHeight) + scroll.position;
	const visibleNodes = getVisibleNodes();
	if (itemIndex >= 0 && itemIndex < visibleNodes.length) {
		const node = visibleNodes[itemIndex];
		if (!node) return;
		if (node.type === 'root') return;

		const effectiveLevel = node.level <= 1 ? 0 : node.level - 1;
		const arrowX = CONFIG.sideMarkerWidth + CONFIG.arrowIconOffsetX + effectiveLevel * CONFIG.indentPerLevel;
		const isExpandable = node.type === 'folder' && node.children.length > 0;
		if (isExpandable && x >= arrowX - 4 && x <= arrowX + CONFIG.arrowIconSize + 4) {
			node.expanded = !node.expanded;
			invalidateVisibleNodesCache();
		} else {
			ui.userSelectingNode = true;
			if (tree.selected) tree.selected.selected = false;
			node.selected = true;
			tree.selected = node;
			if (node.type === 'folder') {
				sendTracksToPlaylist(node);
			}
			if (timers.userSelecting) window.ClearTimeout(timers.userSelecting);
			timers.userSelecting = window.SetTimeout(function() {
				ui.userSelectingNode = false;
				timers.userSelecting = null;
			}, 0);
		}
		window.Repaint();
	}
}

function on_mouse_lbtn_up(x, y) {
	if (scroll.dragging) {
		scroll.dragging = false;

		const onScrollbarArea = isMouseOnScrollbarArea(x, y);
		if (onScrollbarArea) {
			const thumbRect = getScrollbarThumbRect();
			const onThumb = thumbRect && x >= thumbRect.x && x <= thumbRect.x + thumbRect.w &&
				y >= thumbRect.y && y <= thumbRect.y + thumbRect.h;
			const onButton = isOnScrollbarButton(y);
			scroll.hover = onThumb || (onButton === null);
			scroll.arrowHover = onButton;
		} else {
			scroll.hover = false;
			scroll.arrowHover = null;
		}

		window.Repaint();
		return;
	}
	if (scroll.arrowDown) {
		scroll.arrowDown = null;
		window.Repaint();
	}
}

function on_mouse_lbtn_dblclk(x, y) {
	if (y >= CONFIG.searchBarHeight) {
		const currScrollbarWidth = scroll.minimized ? CONFIG.scrollbarNarrowWidth : CONFIG.scrollbarWidth;
		if (x >= view.w - currScrollbarWidth - CONFIG.scrollbarCheckExtraWidth) {
			handleScrollbarClick(x, y);
			return;
		}
	}

	if (y < CONFIG.searchBarHeight) {
		if (search.text.length > 0) {
			search.start = 0;
			search.end = search.text.length;
			search.cursorPos = search.text.length;
			search.inputActive = true;
			startSearchCursorBlink();
			window.RepaintRect(0, 0, view.w, CONFIG.searchBarHeight, true);
		}
		return;
	}

	const adjustedY = y - CONFIG.searchBarHeight;
	const itemIndex = Math.floor(adjustedY / CONFIG.itemHeight) + scroll.position;
	const visibleNodes = getVisibleNodes();
	if (itemIndex >= 0 && itemIndex < visibleNodes.length) {
		const node = visibleNodes[itemIndex];
		if (node.type === 'root') return;
		if (node.type === 'folder') {
			const pl_stnd_idx = plman.FindOrCreatePlaylist(CONFIG.playlistNameStandard, false);
			if (pl_stnd_idx !== -1 && plman.PlaylistItemCount(pl_stnd_idx) > 0) {
				plman.ActivePlaylist = pl_stnd_idx;
				plman.SetPlaylistFocusItem(pl_stnd_idx, 0);
				plman.ClearPlaylistSelection(pl_stnd_idx);
				plman.SetPlaylistSelectionSingle(pl_stnd_idx, 0, true);
				plman.EnsurePlaylistItemVisible(pl_stnd_idx, 0);
				plman.StopAfterCurrent = false;
				plman.ExecutePlaylistDefaultAction(pl_stnd_idx, 0);
			}
		} else if (node.type === 'track') {
			playSingleTrack(node);
		}
	}
}

function on_mouse_wheel(delta) {
	if (scroll.dragging) return;
	const visibleNodes = getVisibleNodes();
	const maxScroll = Math.max(0, visibleNodes.length - view.visibleItems);
	scroll.position = Math.round(Math.max(0, Math.min(maxScroll, scroll.position - delta * CONFIG.scrollStep)));
	window.Repaint();
}

function on_mouse_rbtn_up(x, y) {
	if (y < CONFIG.searchBarHeight) {
		if (search.text) {
			const menu = window.CreatePopupMenu();
			menu.AppendMenuItem(0, 1, 'Clear Search');
			const result = menu.TrackPopupMenu(x, y);
			if (result === 1) clearSearch();
		}
		return;
	}

	const adjustedY = y - CONFIG.searchBarHeight;
	const itemIndex = Math.floor(adjustedY / CONFIG.itemHeight) + scroll.position;
	const visibleNodes = getVisibleNodes();
	if (itemIndex >= 0 && itemIndex < visibleNodes.length) {
		const node = visibleNodes[itemIndex];
		if (node.type === 'root') return;

		const menu = window.CreatePopupMenu();
		menu.AppendMenuItem(0, 1, 'Send to Current Playlist');
		menu.AppendMenuItem(0, 2, 'Append to Current Playlist');
		menu.AppendMenuItem(0, 3, 'Send to New Playlist');
		menu.AppendMenuSeparator();
		menu.AppendMenuItem(0, 4, 'Show Now Playing');
		menu.AppendMenuSeparator();
		menu.AppendMenuItem(0, 5, 'Collapse All');
		menu.AppendMenuItem(0, 6, 'Expand All');

		let Context = null;
		const handles = collectTracksFromNode(node);
		if (handles.Count > 0) {
			Context = fb.CreateContextMenuManager();
			Context.InitContext(handles);
			menu.AppendMenuSeparator();
			Context.BuildMenu(menu, 5000);
		}

		const result = menu.TrackPopupMenu(x, y);
		if (result === 1) sendToCurrentPlaylist(node);
		else if (result === 2) addToCurrentPlaylist(node);
		else if (result === 3) sendToNewPlaylist(node);
		else if (result === 4) locateCurrentTrack();
		else if (result === 5) collapseAll();
		else if (result === 6) expandAll();
		else if (Context && result >= 5000 && result <= 5800) Context.ExecuteByID(result - 5000);
	}

	return true;
}

function on_mouse_move(x, y) {
	const wasMinimized = scroll.minimized;
	const wasHover = scroll.hover;
	const wasArrowHover = scroll.arrowHover;

	if (scroll.dragging) {
		const deltaY = y - scroll.dragStartY;
		const visibleNodes = getVisibleNodes();
		const maxScroll = Math.max(0, visibleNodes.length - view.visibleItems);
		const visibleRatio = view.visibleItems / visibleNodes.length;
		const trackHeight = view.h - CONFIG.searchBarHeight;
		const usable = trackHeight - CONFIG.scrollbarButtonHeight * 2;
		const thumbHeight = Math.max(CONFIG.minThumbHeight, usable * visibleRatio);
		const thumbTravel = Math.max(0, usable - thumbHeight);

		if (thumbTravel > 0) {
			const scrollDelta = (deltaY / thumbTravel) * maxScroll;
			scroll.position = Math.round(Math.max(0, Math.min(maxScroll, scroll.dragStartScroll + scrollDelta)));
		}
		window.Repaint();
		return;
	}

	const onScrollbarArea = isMouseOnScrollbarArea(x, y);

	if (onScrollbarArea) {
		scroll.minimized = false;

		const thumbRect = getScrollbarThumbRect();
		const onThumb = thumbRect && x >= thumbRect.x && x <= thumbRect.x + thumbRect.w &&
			y >= thumbRect.y && y <= thumbRect.y + thumbRect.h;
		const onButton = isOnScrollbarButton(y);

		scroll.hover = onThumb || (onButton === null);
		scroll.arrowHover = onButton;

		if (timers.scrollbarHide) {
			window.ClearTimeout(timers.scrollbarHide);
			timers.scrollbarHide = null;
		}
	} else {
		scroll.hover = false;
		scroll.arrowHover = null;
		scroll.arrowDown = null;
		if (scroll.active) startScrollbarHideTimer();
	}

	if (y < CONFIG.searchBarHeight) {
		if (wasMinimized !== scroll.minimized || wasHover !== scroll.hover || wasArrowHover !== scroll.arrowHover) {
			window.Repaint();
		}
		return;
	}

	if (wasMinimized !== scroll.minimized || wasHover !== scroll.hover || wasArrowHover !== scroll.arrowHover) {
		window.Repaint();
	}
}

function on_char(code) {
	if (code >= 32) {
		const text = String.fromCharCode(code);
		if (search.start != search.end) {
			const start = Math.min(search.start, search.end);
			const end = Math.max(search.start, search.end);
			search.text = search.text.substring(0, start) + text + search.text.substring(end);
			search.cursorPos = start + 1;
		} else {
			search.text = search.text.substring(0, search.cursorPos) + text + search.text.substring(search.cursorPos);
			search.cursorPos++;
		}
		search.start = search.cursorPos;
		search.end = search.cursorPos;
		search.inputActive = true;
		startSearchCursorBlink();
		performSearch();
		scroll.position = 0;
		window.Repaint();
	} else if (code == 8) { // Backspace
		if (search.start != search.end) {
			const start = Math.min(search.start, search.end);
			const end = Math.max(search.start, search.end);
			search.text = search.text.substring(0, start) + search.text.substring(end);
			search.cursorPos = start;
		} else if (search.cursorPos > 0) {
			search.text = search.text.substring(0, search.cursorPos - 1) + search.text.substring(search.cursorPos);
			search.cursorPos--;
		}
		search.start = search.cursorPos;
		search.end = search.cursorPos;
		search.inputActive = true;
		startSearchCursorBlink();
		performSearch();
		scroll.position = 0;
		window.Repaint();
	} else if (code == 27) { // Escape
		clearSearch();
		search.inputActive = false;
		stopSearchCursorBlink();
	} else if (code == 13) { // Enter
		if (search.text) {
			performSearch();
			scroll.position = 0;
			window.Repaint();
		}
	}
}

function on_key_down(vkey) {
	switch (vkey) {
		case 37: // Left
			if (search.cursorPos > 0) {
				search.cursorPos--;
				search.start = search.cursorPos;
				search.end = search.cursorPos;
				window.Repaint();
			}
			break;
		case 39: // Right
			if (search.cursorPos < search.text.length) {
				search.cursorPos++;
				search.start = search.cursorPos;
				search.end = search.cursorPos;
				window.Repaint();
			}
			break;
		case 36: // Home
			search.cursorPos = 0;
			search.start = 0;
			search.end = 0;
			window.Repaint();
			break;
		case 35: // End
			search.cursorPos = search.text.length;
			search.start = search.text.length;
			search.end = search.text.length;
			window.Repaint();
			break;
		case 46: // Delete
			if (search.start != search.end) {
				const start = Math.min(search.start, search.end);
				const end = Math.max(search.start, search.end);
				search.text = search.text.substring(0, start) + search.text.substring(end);
				search.cursorPos = start;
			} else if (search.cursorPos < search.text.length) {
				search.text = search.text.substring(0, search.cursorPos) + search.text.substring(search.cursorPos + 1);
			}
			search.start = search.cursorPos;
			search.end = search.cursorPos;
			performSearch();
			scroll.position = 0;
			window.Repaint();
			break;
	}
}

function on_focus(is_focused) {
	if (!is_focused) {
		if (search.inputActive) {
			search.inputActive = false;
			stopSearchCursorBlink();
			search.cursorVisible = false;
			window.RepaintRect(0, 0, view.w, CONFIG.searchBarHeight, true);
		}
	}
}

function on_mouse_leave() {
	scroll.hover = false;
	scroll.arrowHover = null;
	scroll.arrowDown = null;
	startScrollbarHideTimer();
}

function on_playback_new_track() {
	updateNowPlayingNode();
	window.Repaint();
}

function on_playback_stop(reason) {
	if (reason === 2) return;
	nowPlaying.nodePath.clear();
	nowPlaying.node = null;
	nowPlaying.trackPath = '';
	window.Repaint();
}

function on_item_focus_change() {
	if (ui.userSelectingNode) return;
	if (!fb || !fb.GetFocusItem) return;
	const handle = fb.GetFocusItem();
	if (!handle) return;

	if (!library.handles) return;
	const itemIndex = library.handles.Find(handle);
	if (itemIndex === -1) return;

	const targetNode = findNodeByHandleIndex(itemIndex);
	if (!targetNode) return;

	if (tree.selected && tree.selected.id === targetNode.id) return;

	if (tree.selected) tree.selected.selected = false;
	targetNode.selected = true;
	tree.selected = targetNode;

	scrollToNode(targetNode, false);
	window.Repaint();
}

function on_playlist_switch() {
	if (ui.userSelectingNode) return;
	if (!fb || !fb.GetNowPlaying) return;
	const np = fb.GetNowPlaying();
	if (!np) return;

	if (!library.handles) return;
	const npIndex = library.handles.Find(np);
	if (npIndex === -1) return;

	const foundNode = findNodeByHandleIndex(npIndex);
	if (!foundNode) return;

	if (tree.selected) {
		tree.selected.selected = false;
	}

	foundNode.selected = true;
	tree.selected = foundNode;

	scrollToNode(foundNode, true);
	window.Repaint();
}

function on_library_items_added() { refresh(); }
function on_library_items_removed() { refresh(); }
function on_library_items_changed() { refresh(); }

function on_script_unload() {
	if (timers.loading)       { window.ClearTimeout(timers.loading);       timers.loading = null; }
	if (timers.scrollbarHide) { window.ClearTimeout(timers.scrollbarHide); timers.scrollbarHide = null; }
	if (timers.userSelecting) { window.ClearTimeout(timers.userSelecting); timers.userSelecting = null; }
	if (timers.searchCursor)  { window.ClearInterval(timers.searchCursor); timers.searchCursor = null; }

	tree.data = [];
	tree.byId.clear();
	tree.cachedVisible = null;
	tree.selected = null;
	nowPlaying.node = null;
	nowPlaying.trackPath = '';
	nowPlaying.nodePath.clear();
	search.text = '';
	search.visibleIds = null;
}

function on_font_changed() {
	get_font();
	applyDpiScaling();
	recalcVisibleItems();
	updateScrollbarState();
	cache.needRecalc = true;
	window.Repaint();
}

function on_colours_changed() {
	get_color();
	window.Repaint();
}

// ========== Initialization ==========
function init() {
	get_color();
	get_font();
	applyDpiScaling();
	recalcVisibleItems();
	cache.needRecalc = true;
	scheduleTreeLoad();
}

init();
