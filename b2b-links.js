// ========== B2B LINK MANAGER ==========
// Manages ASICS and Brooks scraper links in Firestore.
// Replaces hardcoded link lists with dynamic, editable lists.
// Tracks phase-outs when inventory hits 0 across all sizes.

var B2BLinkManager = {

    brands: ['asics', 'brooks'],
    cache: { asics: null, brooks: null },

    // ========== INIT ==========
    init: async function() {
        for (var i = 0; i < this.brands.length; i++) {
            await this.renderBrand(this.brands[i]);
        }
    },

    // ========== FIRESTORE HELPERS ==========
    collection: function(brand) {
        return db.collection('b2b-links').doc(brand).collection('links');
    },

    getLinks: async function(brand, forceRefresh) {
        if (!forceRefresh && this.cache[brand] !== null) return this.cache[brand];
        var snap = await this.collection(brand).orderBy('addedAt', 'asc').get();
        var links = [];
        snap.forEach(function(doc) {
            links.push(Object.assign({ id: doc.id }, doc.data()));
        });
        this.cache[brand] = links;
        return links;
    },

    addLink: async function(brand, url, label) {
        if (!url.trim()) return;
        // Extract a handle guess from the URL for phase-out tracking
        var handle = this.guessHandle(brand, url);
        await this.collection(brand).add({
            url: url.trim(),
            label: label.trim() || handle,
            handle: handle,
            active: true,
            addedAt: new Date().toISOString(),
            zeroedAt: null,
        });
        await this.getLinks(brand, true); // refresh cache
        await this.renderBrand(brand);
    },

    deleteLink: async function(brand, id) {
        await this.collection(brand).doc(id).delete();
        await this.getLinks(brand, true);
        await this.renderBrand(brand);
    },

    restoreLink: async function(brand, id) {
        await this.collection(brand).doc(id).update({ active: true, zeroedAt: null });
        await this.getLinks(brand, true);
        await this.renderBrand(brand);
    },

    // Called after inventory generation — marks links as inactive if handle has 0 total qty
    checkPhaseOuts: async function(brand, inventoryData) {
        var links = await this.getLinks(brand);
        var activeLinks = links.filter(function(l) { return l.active; });
        if (!activeLinks.length || !inventoryData || !inventoryData.length) return;

        // Build total qty per handle from inventory
        var qtyByHandle = {};
        inventoryData.forEach(function(row) {
            var h = row['Handle'] || '';
            var qty = parseInt(row['On hand (new)'] || row['On hand'] || '0') || 0;
            qtyByHandle[h] = (qtyByHandle[h] || 0) + qty;
        });

        var now = new Date().toISOString();
        var phased = [];
        for (var i = 0; i < activeLinks.length; i++) {
            var link = activeLinks[i];
            if (link.handle && qtyByHandle.hasOwnProperty(link.handle) && qtyByHandle[link.handle] === 0) {
                await this.collection(brand).doc(link.id).update({ active: false, zeroedAt: now });
                phased.push(link.label || link.handle);
            }
        }
        if (phased.length > 0) {
            console.log('[B2BLinks] Phase-outs for ' + brand + ':', phased);
            await this.renderBrand(brand);
        }
        return phased;
    },

    // Guess the Shopify handle from a B2B URL
    guessHandle: function(brand, url) {
        if (brand === 'asics') {
            // https://b2b.asics.com/orders/100522727/products/1013A142?colorCode=401
            var m = url.match(/\/products\/([^?\/]+)/i);
            if (m) return m[1].toLowerCase(); // e.g. "1013a142"
        }
        if (brand === 'brooks') {
            // URL contains style code like /110479/110479091/
            var m2 = url.match(/\/(\d{9})\//);
            if (m2) return m2[1]; // e.g. "110479091"
        }
        return '';
    },

    // ========== RENDER ==========
    renderBrand: async function(brand) {
        var links = await this.getLinks(brand); // uses cache if available
        var activeLinks = links.filter(function(l) { return l.active; });
        var archivedLinks = links.filter(function(l) { return !l.active; });

        var container = document.getElementById(brand + '-link-manager');
        if (!container) return;

        var activeTab = container.dataset.tab || 'active';

        container.innerHTML = `
            <div class="blm-tabs">
                <button class="blm-tab ${activeTab === 'active' ? 'blm-tab-active' : ''}"
                    onclick="B2BLinkManager.switchTab('${brand}', 'active')">
                    Active <span class="blm-count">${activeLinks.length}</span>
                </button>
                <button class="blm-tab ${activeTab === 'archived' ? 'blm-tab-active' : ''}"
                    onclick="B2BLinkManager.switchTab('${brand}', 'archived')">
                    Archived <span class="blm-count blm-count-warn">${archivedLinks.length}</span>
                </button>
            </div>

            <div class="blm-panel" id="${brand}-tab-active" style="display:${activeTab === 'active' ? 'block' : 'none'}">
                <div class="blm-list" id="${brand}-link-list">
                    ${activeLinks.length === 0
                        ? '<div class="blm-empty">No links yet — add one below</div>'
                        : activeLinks.map(function(link) {
                            return `<div class="blm-item" id="blm-item-${link.id}">
                                <div class="blm-item-main">
                                    <span class="blm-label" title="${link.url}">${link.label || link.url}</span>
                                    <span class="blm-handle">${link.handle || ''}</span>
                                </div>
                                <div class="blm-item-actions">
                                    <a href="${link.url}" target="_blank" class="blm-open" title="Open link">↗</a>
                                    <button class="blm-delete" onclick="B2BLinkManager.deleteLink('${brand}', '${link.id}')" title="Delete">✕</button>
                                </div>
                            </div>`;
                        }).join('')
                    }
                </div>
                <button class="copy-btn" style="margin-top:8px;" onclick="B2BLinkManager.copyActive('${brand}')">Copy All Links</button>
                <div class="blm-add">
                    <input type="text" class="blm-input" id="${brand}-add-url" placeholder="Paste link URL..." onkeydown="if(event.key==='Enter')B2BLinkManager.submitAdd('${brand}')">
                    <input type="text" class="blm-input blm-input-label" id="${brand}-add-label" placeholder="Label (optional)" onkeydown="if(event.key==='Enter')B2BLinkManager.submitAdd('${brand}')">
                    <button class="blm-add-btn" onclick="B2BLinkManager.submitAdd('${brand}')">+ Add</button>
                </div>
            </div>

            <div class="blm-panel" id="${brand}-tab-archived" style="display:${activeTab === 'archived' ? 'block' : 'none'}">
                ${archivedLinks.length === 0
                    ? '<div class="blm-empty">No archived links</div>'
                    : archivedLinks.map(function(link) {
                        var date = link.zeroedAt ? new Date(link.zeroedAt).toLocaleDateString() : 'unknown';
                        return `<div class="blm-item blm-item-archived">
                            <div class="blm-item-main">
                                <span class="blm-label blm-label-muted" title="${link.url}">${link.label || link.url}</span>
                                <span class="blm-handle blm-handle-warn">Zeroed ${date}</span>
                            </div>
                            <div class="blm-item-actions">
                                <a href="${link.url}" target="_blank" class="blm-open" title="Open link">↗</a>
                                <button class="blm-restore" onclick="B2BLinkManager.restoreLink('${brand}', '${link.id}')" title="Restore">↺</button>
                                <button class="blm-delete" onclick="B2BLinkManager.deleteLink('${brand}', '${link.id}')" title="Delete permanently">✕</button>
                            </div>
                        </div>`;
                    }).join('')
                }
            </div>
        `;
    },

    switchTab: function(brand, tab) {
        var container = document.getElementById(brand + '-link-manager');
        container.dataset.tab = tab;
        this.renderBrand(brand);
    },

    submitAdd: async function(brand) {
        var urlInput = document.getElementById(brand + '-add-url');
        var labelInput = document.getElementById(brand + '-add-label');
        var url = urlInput.value.trim();
        if (!url) { urlInput.focus(); return; }
        var btn = document.querySelector(`#${brand}-link-manager .blm-add-btn`);
        btn.textContent = 'Adding...'; btn.disabled = true;
        await this.addLink(brand, url, labelInput.value.trim());
        // inputs get cleared by re-render
    },

    copyActive: function(brand) {
        var links = (this.cache[brand] || []).filter(function(l) { return l.active; });
        var text = links.map(function(l) { return l.url; }).join('\n');
        navigator.clipboard.writeText(text).then(function() {
            var btn = document.querySelector(`#${brand}-link-manager .copy-btn`);
            var orig = btn.textContent; btn.textContent = 'Copied!'; btn.classList.add('copied');
            setTimeout(function() { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
        });
    },
};

// ========== CSS ==========
(function() {
    var style = document.createElement('style');
    style.textContent = `
        .blm-tabs { display: flex; gap: 4px; margin-bottom: 8px; }
        .blm-tab { background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 6px; padding: 5px 12px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; color: #71717a; transition: all .15s; display: flex; align-items: center; gap: 5px; }
        .blm-tab:hover { background: #e4e4e7; }
        .blm-tab-active { background: #18181b; color: #fff; border-color: #18181b; }
        .blm-count { background: rgba(255,255,255,.2); padding: 1px 5px; border-radius: 3px; font-size: 10px; }
        .blm-tab:not(.blm-tab-active) .blm-count { background: #e4e4e7; color: #52525b; }
        .blm-count-warn { background: #fef3c7 !important; color: #92400e !important; }
        .blm-tab-active .blm-count-warn { background: rgba(250,204,21,.3) !important; color: #fde68a !important; }

        .blm-list { max-height: 200px; overflow-y: auto; background: #fafafa; border-radius: 6px; border: 1px solid #e4e4e7; margin-bottom: 8px; }
        .blm-list::-webkit-scrollbar { width: 4px; }
        .blm-list::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 2px; }
        .blm-empty { padding: 16px; text-align: center; color: #a1a1aa; font-size: 12px; font-style: italic; }

        .blm-item { display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-bottom: 1px solid #f4f4f5; gap: 8px; }
        .blm-item:last-child { border-bottom: none; }
        .blm-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .blm-label { font-size: 12px; font-weight: 600; color: #18181b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .blm-label-muted { color: #a1a1aa; }
        .blm-handle { font-size: 10px; color: #a1a1aa; font-family: 'SF Mono', monospace; }
        .blm-handle-warn { color: #d97706; font-weight: 600; }

        .blm-item-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .blm-open { font-size: 14px; color: #a1a1aa; text-decoration: none; padding: 2px 4px; border-radius: 4px; transition: color .15s; }
        .blm-open:hover { color: #18181b; }
        .blm-delete { background: none; border: none; color: #d4d4d8; font-size: 13px; cursor: pointer; padding: 2px 5px; border-radius: 4px; font-family: inherit; transition: all .15s; line-height: 1; }
        .blm-delete:hover { background: #fef2f2; color: #ef4444; }
        .blm-restore { background: none; border: none; color: #d4d4d8; font-size: 16px; cursor: pointer; padding: 2px 5px; border-radius: 4px; font-family: inherit; transition: all .15s; line-height: 1; }
        .blm-restore:hover { background: #f0fdf4; color: #16a34a; }
        .blm-item-archived { opacity: .8; }

        .blm-add { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        .blm-input { flex: 1; min-width: 120px; padding: 7px 10px; border: 1px solid #e4e4e7; border-radius: 6px; font-size: 12px; font-family: inherit; outline: none; transition: border-color .15s; background: #fff; }
        .blm-input:focus { border-color: #18181b; }
        .blm-input-label { flex: 0 0 130px; min-width: 0; }
        .blm-add-btn { background: #18181b; color: #fff; border: none; border-radius: 6px; padding: 7px 12px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; transition: opacity .15s; }
        .blm-add-btn:hover { opacity: .85; }
        .blm-add-btn:disabled { opacity: .5; cursor: not-allowed; }

        .blm-panel { }
    `;
    document.head.appendChild(style);
})();

// Auto-init when DOM + Firebase ready
document.addEventListener('DOMContentLoaded', function() {
    var tryInit = setInterval(function() {
        if (typeof db !== 'undefined') {
            clearInterval(tryInit);
            B2BLinkManager.init();
        }
    }, 300);
});