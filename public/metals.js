(function ($) {

    'use strict';

    $(function () {
        let draftSubmitting = false;
        let ACTIVE_METAL = ''; // '' means auto / show only if single metal
        let ACTIVE_SHAPE = 'All';
        let ACTIVE_INV_VIEW = 'stock'; // 'stock' or 'sold'
        let tileIdx = 0;
        let activeSellId = null;
        let activeSellIdx = null;
        let ATT_MODE = 'entry'; // 'entry' or 'sell'

        if (!window.CSS) window.CSS = {};
        if (!window.CSS.escape) {
            window.CSS.escape = function (s) {
                return String(s).replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
            };
        }

        const $tbody = $('#metalTbody');

        function scheduleInvResize() {
            // run after layout updates
            requestAnimationFrame(() => {
                syncInvWrapHeight();
                // run one more time after fonts/grid settle
                setTimeout(syncInvWrapHeight, 80);
            });
        }

        // keep summary wrapper height correct on window resize
        $(window).on('resize.pmInv', function () {
            clearTimeout(window.__pmInvResizeT);
            window.__pmInvResizeT = setTimeout(scheduleInvResize, 60);
        });

        function calcSoldCount(items) {
            let n = 0;
            (items || []).forEach(it => {
                const sold = (num(it.sell_price) > 0) || String(it.sell_date || '').trim();
                if (!sold) return;

                // count pcs if provided, otherwise 1
                let pcs = parseInt(String(it.pcs ?? '').replace(/[^\d]/g, ''), 10);
                if (!Number.isFinite(pcs) || pcs <= 0) pcs = 1;
                n += pcs;
            });
            return n;
        }

        function updateHeaderSoldCount($header, $detail) {
            if (!$header?.length || !$detail?.length) return;

            const items = getItemsForDetail($detail);
            const soldCount = calcSoldCount(items);

            const $badge = $header.find('[data-sold-count]');
            $badge.text(soldCount);
            $badge.toggleClass('is-zero', soldCount <= 0);
        }

        function syncInvWrapHeight() {
            const $wrap = $('#invSummary');
            const $active = (ACTIVE_INV_VIEW === 'sold') ? $('#invSummarySold') : $('#invSummaryStock');

            const child = $active.children().first().get(0);

            let h = 220;
            if (child) {
                // use real rendered height (prevents huge blank space)
                h = Math.max(220, Math.ceil(child.getBoundingClientRect().height));
            }

            $wrap.css('height', h + 'px');
        }

        let $weightProbeSelect = null;

        // Convert weight to label used by Inventory Summary grouping
        function weightLabelFromValue(rawWeight) {
            const raw = String(rawWeight ?? '').trim();
            if (!raw) return 'Unknown';

            const w = normalizeWeightToOptionValue(raw);
            const n = parseFloat(w);

            const near = (a, b, eps = 0.0005) => Math.abs(a - b) <= eps;

            if (Number.isFinite(n)) {
                if (near(n, 31.1035)) return '1 oz';
                if (near(n, 62.207)) return '2 oz';
                if (near(n, 155.5175)) return '5 oz';
                if (near(n, 311.035)) return '10 oz';
            }

            if (!$weightProbeSelect) {
                $weightProbeSelect = $(itemRowHtml(0)).find('select.pm-weight-select').first();
            }

            const $opt = $weightProbeSelect.find(`option[value="${CSS.escape(String(w))}"]`).first();
            return $opt.length ? $opt.text().trim() : (String(w) + ' g');
        }

        function setInvView(view) {
            ACTIVE_INV_VIEW = (view === 'sold') ? 'sold' : 'stock';

            const $wrap = $('#invSummary');
            $wrap.attr('data-view', ACTIVE_INV_VIEW);

            $('#invSummaryStock').toggleClass('is-active', ACTIVE_INV_VIEW === 'stock');
            $('#invSummarySold').toggleClass('is-active', ACTIVE_INV_VIEW === 'sold');

            buildSummaryFromDOM();
            setTimeout(syncInvWrapHeight, 0);
        }

        /* Edge click */
        $(document).on('click', '[data-inv-edge]', function () {
            const target = String($(this).attr('data-inv-edge') || 'stock');
            const $wrap = $('#invSummary');

            // add switching class to animate expand
            if (target === 'sold') $wrap.addClass('is-switching-to-sold');
            else $wrap.addClass('is-switching-to-stock');

            // wait a bit so user sees expansion, then switch view
            setTimeout(() => {
                setInvView(target);

                // remove switching class after view swapped
                $wrap.removeClass('is-switching-to-sold is-switching-to-stock');
            }, 220);
        });

        /* Initial */
        setInvView(ACTIVE_INV_VIEW);

        function getEntryIdFromItemRow($itemRow) {
            const $detail = $itemRow.closest('tr.pm-detail');
            return String($detail.data('detail-for') || '');
        }

        function getItemIdx($itemRow) {
            return Number($itemRow.attr('data-item-row')) || 0;
        }

        function getVisibleHeaders() {
            return $tbody.find('tr.pm-header[data-id]').not('.hidden');
        }

        function toGramsFromWeightLabel(label) {
            // label examples: "100 g", "1 oz", "10 oz", "31.1035 g (1 oz)"
            const s = String(label || '').trim().toLowerCase();
            if (!s) return 0;

            const m = s.match(/(\d+(?:\.\d+)?)/);
            if (!m) return 0;
            const n = parseFloat(m[1]);
            if (!Number.isFinite(n)) return 0;

            if (s.includes('oz')) return n * 31.1035;
            return n; // grams
        }

        function fmtWeightCompact(g) {
            const grams = Number(g) || 0;
            const oz = grams / 31.1035;

            // show whole oz if very close to integer (like 10 oz)
            const ozRounded = Math.round(oz);
            const isWholeOz = Math.abs(oz - ozRounded) < 0.02;

            const gTxt = grams.toLocaleString('en-US', { maximumFractionDigits: 2 });
            const ozTxt = (isWholeOz ? ozRounded : oz).toLocaleString('en-US', { maximumFractionDigits: 2 });

            return `${gTxt} g (${ozTxt} oz)`;
        }

        function previewSrc(metal, shape) {
            const m = (metal || 'miscellaneous').toLowerCase();
            const s = (shape || 'bar').toLowerCase();
            const isCoin = (s === 'coin');

            const IMG = {
                gold: { bar: '/images/metals/goldbar.png', coin: '/images/metals/goldcoin.png' },
                silver: { bar: '/images/metals/silverbar.png', coin: '/images/metals/silvercoin.png' },
                platinum: { bar: '/images/metals/platinumbar.png', coin: '/images/metals/platinumcoin.png' },
                miscellaneous: { bar: '/images/metals/miscbar.png', coin: '/images/metals/misccoin.png' },
            };

            const pack = IMG[m] || IMG.miscellaneous;
            return isCoin ? (pack.coin || pack.bar) : pack.bar;
        }

        function prettyMetal(m) { return (m || '').replace(/\b\w/g, c => c.toUpperCase()); }
        function prettyShape(s) { return (s || '').replace(/\b\w/g, c => c.toUpperCase()); }

        function updateItemPreview($tr) {
            const metal = $tr.find('select[name$="[metal_type]"]').val();
            const shape = $tr.find('select[name$="[metal_shape]"]').val();

            const $wrap = $tr.find('[data-preview]');
            const hasBasics = !!(metal && shape);

            // weight label
            const wSel = $tr.find('select[name$="[weight]"]').val();
            const wCustom = ($tr.find('.pm-weight-custom').val() || '').trim();
            const weightLabel =
                wSel === 'custom'
                    ? (wCustom ? weightLabelFromValue(wCustom) : '—')
                    : (wSel ? weightLabelFromValue(wSel) : '—');

            // SOLD?
            const sellP = ($tr.find('input[name$="[sell_price]"]').val() || '').trim();
            const sellD = ($tr.find('input[name$="[sell_date]"]').val() || '').trim();
            const hasSell = (num(sellP) > 0) || !!sellD;

            const entryId = getEntryIdFromItemRow($tr);
            const isSaved = /^\d+$/.test(entryId);
            const $itemWrap = $tr.find('.pm-item-wrap');

            // sold tint
            $itemWrap.toggleClass('is-sold', hasSell);

            // show/hide Difference block
            $tr.find('[data-diff-wrap]').toggleClass('hidden', !hasSell);
            if (!hasSell) updateDiffUI($tr, null);

            // CLOSED logic: sold + saved => lock unless user unlocked it
            const unlocked = $itemWrap.hasClass('is-unlocked');

            if (hasSell && isSaved && !unlocked) {
                $itemWrap.addClass('is-locked');
                $itemWrap.find('[data-closed-badge]').removeClass('hidden');
                $itemWrap.find('[data-action="unlock-sold-item"]').removeClass('hidden');

                // disable editable fields in this item
                $tr.find('.gts-editable').prop('disabled', true);
                $tr.find('select').trigger('pm:refresh');

                // disable Sell Upload/View when locked
                $itemWrap.find('[data-action="sell-upload"], [data-action="sell-view"]').prop('disabled', true);

                // disable image actions + sell actions when locked
                $itemWrap.find('[data-action="item-img-upload"], [data-action="item-img-remove"]').prop('disabled', true);
                $itemWrap.find('[data-action="sell-upload"], [data-action="sell-view"]').prop('disabled', true);
            } else {
                // if not sold, reset lock/unlock state
                if (!hasSell) $itemWrap.removeClass('is-locked is-unlocked');

                $itemWrap.removeClass('is-locked');
                $itemWrap.find('[data-closed-badge]').addClass('hidden');
                $itemWrap.find('[data-action="unlock-sold-item"]').addClass('hidden');

                // enable Sell Upload/View when not locked
                $itemWrap.find('[data-action="sell-upload"], [data-action="sell-view"]').prop('disabled', false);

                // enable again when unlocked/not locked
                $itemWrap.find('[data-action="item-img-upload"], [data-action="item-img-remove"]').prop('disabled', false);
                $itemWrap.find('[data-action="sell-upload"], [data-action="sell-view"]').prop('disabled', false);
            }

            // If metal/shape not selected yet → keep preview muted, no jumping
            if (!hasBasics) {
                $wrap.removeClass('is-ready is-sold').addClass('is-empty');
                $wrap.find('[data-preview-badge]').text('—');
                $wrap.find('[data-preview-title]').text('—');
                $wrap.find('[data-preview-sub]').text('—');
                $wrap.find('[data-preview-img]').attr('src', '');
                $tr.find('[data-action="item-img-remove"]').addClass('hidden');
                return;
            }

            const customPath = ($tr.find('input[name$="[image_path]"]').val() || '').trim();
            const idx = getItemIdx($tr);

            let src = previewSrc(metal, shape);
            const hasCustom = !!customPath && /^\d+$/.test(entryId);

            if (hasCustom) {
                src = `/metals/${entryId}/items/${idx}/image?v=${Date.now()}`;
                $tr.find('[data-action="item-img-remove"]').removeClass('hidden');
            } else {
                $tr.find('[data-action="item-img-remove"]').addClass('hidden');
            }

            $wrap.toggleClass('is-custom', hasCustom);

            const $detail = $tr.closest('tr.pm-detail');
            const $img = $wrap.find('[data-preview-img]');

            $img.off('load.pmPrev').on('load.pmPrev', function () {
                refreshDetailHeight($detail);
            });

            $wrap.removeClass('is-empty');
            $img.attr('src', src);

            $wrap.find('[data-preview-badge]').text(weightLabel || '—');
            $wrap.find('[data-preview-title]').text(`${prettyMetal(metal)} ${prettyShape(shape)}`);
            $wrap.find('[data-preview-sub]').text((shape || '').toLowerCase() === 'coin' ? 'Collector coin' : 'Bullion bar');

            $wrap.removeClass('is-ready');
            requestAnimationFrame(() => $wrap.addClass('is-ready'));

            // sold background tint on preview block
            $wrap.toggleClass('is-sold', hasSell);

            refreshDetailHeight($detail);
        }

        // update on change
        $tbody.on('change input', 'select[name$="[metal_type]"], select[name$="[metal_shape]"], select[name$="[weight]"], .pm-weight-custom', function () {
            const $tr = $(this).closest('tr[data-item-row]');
            updateItemPreview($tr);
        });

        function unformat(v) {
            return String(v ?? '').replace(/[^\d.-]/g, '');
        }

        function updateDiffUI($itemRow, diff) {
            const $pill = $itemRow.find('[data-diff-pill]').first();
            if (!$pill.length) return;

            // reset classes
            $pill.removeClass('pm-diff-profit pm-diff-loss pm-diff-neutral');

            if (diff === null) {
                $pill.addClass('pm-diff-neutral').text('—');
                return;
            }

            const eps = 0.0001;
            if (Math.abs(diff) <= eps) {
                $pill.addClass('pm-diff-neutral').text('AED 0.00');
                return;
            }

            const txt = (diff > 0 ? '+' : '-') + fmtMoneyAED(Math.abs(diff)).replace('AED ', 'AED ');
            $pill.text(txt);

            // Profit green, Loss red
            if (diff > 0) $pill.addClass('pm-diff-profit');
            else $pill.addClass('pm-diff-loss');
        }

        function applySellVsPurchaseHighlight($itemRow) {
            if (!$itemRow || !$itemRow.length) return;

            const $p = $itemRow.find('input[name$="[purchase_price]"]').first();
            const $s = $itemRow.find('input[name$="[sell_price]"]').first();
            if (!$p.length || !$s.length) return;

            const p = Number(unformat($p.val()));
            const s = Number(unformat($s.val()));

            // Remove any old sell input coloring (we don't color sell anymore)
            $s.removeClass('pm-sell-good pm-sell-bad');

            // if invalid/empty, clear diff
            if (!Number.isFinite(p) || !Number.isFinite(s) || p <= 0 || s <= 0) {
                updateDiffUI($itemRow, null);
                return;
            }

            const diff = s - p; // profit if positive
            updateDiffUI($itemRow, diff);
        }

        // live update when user changes price
        $tbody.on('input change blur', 'input[name$="[purchase_price]"], input[name$="[sell_price]"]', function () {
            const $row = $(this).closest('tr[data-item-row]');
            applySellVsPurchaseHighlight($row);
        });

        function escapeHtml(s) {
            return String(s ?? '')
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function formatAED(val) {
            const n = Number(unformat(val));
            if (isNaN(n)) return '';
            return 'AED ' + n.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }

        function tileAccentClass(idx) {
            const accents = [
                'pm-accent-gold',
                'pm-accent-mint',
                'pm-accent-blue',
                'pm-accent-purple',
                'pm-accent-peach',
            ];
            return accents[idx % accents.length];
        }

        function asDate(v) {
            if (!v) return '';
            // handles "2026-01-07", "2026-01-07T00:00:00.000000Z", etc.
            return String(v).slice(0, 10);
        }

        function normShape(v) {
            v = (v ?? '').toString().trim().toLowerCase();
            return v; // keep 'other' as 'other'
        }

        function normMetal(v) {
            v = (v ?? '').toString().trim().toLowerCase();
            if (!v) return '';
            return v; // gold/silver/platinum/miscellaneous
        }

        function persistDetailSeedFromDOM($detail) {
            const latest = readItemsFromDOM($detail);
            $detail.data('items', latest);
            return latest;
        }

        function refreshDetailHeight($detail) {
            const $anim = $detail.find('.pm-detail-anim').first();
            if (!$anim.length) return;
            if ($detail.hasClass('hidden')) return;

            const inner = $detail.find('.pm-detail-inner').get(0);
            const h = inner ? inner.scrollHeight : 0;

            requestAnimationFrame(() => {
                $anim.css('--pm-detail-max', h + 'px');
            });
        }

        function attachDetailAutoResize($detail) {
            if ($detail.data('ro')) return;

            const inner = $detail.find('.pm-detail-inner').get(0);
            if (!inner) return;

            const ro = new ResizeObserver(() => refreshDetailHeight($detail));
            ro.observe(inner);
            $detail.data('ro', ro);
        }

        function detachDetailAutoResize($detail) {
            const ro = $detail.data('ro');
            if (ro) { ro.disconnect(); }
            $detail.removeData('ro');
        }

        function openDetailRow($detail) {
            const $anim = $detail.find('.pm-detail-anim').first();
            if (!$anim.length) { $detail.removeClass('hidden'); return; }

            $detail.removeClass('hidden');
            $anim.css('--pm-detail-max', '0px');

            requestAnimationFrame(() => {
                refreshDetailHeight($detail);
                $anim.addClass('is-open');
            });

            attachDetailAutoResize($detail);
            setTimeout(() => refreshDetailHeight($detail), 60);
        }

        function closeDetailRow($detail) {
            const $anim = $detail.find('.pm-detail-anim').first();
            if (!$anim.length) { $detail.addClass('hidden'); return; }

            // set current height first
            refreshDetailHeight($detail);

            requestAnimationFrame(() => {
                $anim.removeClass('is-open');
                $anim.css('--pm-detail-max', '0px');
            });

            const finish = () => {
                $detail.addClass('hidden');
                detachDetailAutoResize($detail);
                $anim.off('transitionend.pmClose');
            };

            $anim.off('transitionend.pmClose').one('transitionend.pmClose', finish);
            setTimeout(finish, 380);
        }

        function openOnlyThisDetail(id) {
            const $detail = $tbody.find(`tr.pm-detail[data-detail-for="${id}"]`);
            if (!$detail.length) return;

            // close ALL others (and reset their buttons)
            $tbody.find('tr.pm-detail').each(function () {
                const $d = $(this);
                if (String($d.data('detail-for')) === String(id)) return;
                if (!$d.hasClass('hidden')) closeDetailAndReset($d);
            });

            // open this one (if not already open)
            if ($detail.hasClass('hidden')) openDetailRow($detail);
        }

        function getHeaderForDetail($detail) {
            const id = String($detail.data('detail-for') || '');
            // draft detail-for is tmp id, saved detail-for is numeric id
            let $h = $tbody.find(`tr.pm-header[data-id="${id}"]`).first();
            if (!$h.length) $h = $tbody.find(`tr.pm-header[data-tmp="${id}"]`).first();
            return $h;
        }

        function closeDetailAndReset($detail) {
            if (!$detail || !$detail.length) return;

            const $header = getHeaderForDetail($detail);
            const $group = $header.add($detail);

            // this hides Save/Cancel + removes editing class
            setRowEditing($group, false);

            // close the detail
            closeDetailRow($detail); // use your smooth close function, or $detail.addClass('hidden')
        }

        function normalizeWeightToOptionValue(raw) {
            const s = String(raw ?? '').trim();
            if (!s) return '';

            // extract first numeric
            const m = s.match(/-?\d+(\.\d+)?/);
            if (!m) return '';

            const n = parseFloat(m[0]);
            if (!Number.isFinite(n)) return '';

            // canonical string: "100.0000" -> "100", "31.10350" -> "31.1035"
            return String(n);
        }

        function getItemsForDetail($detail) {
            // If the items table is currently rendered/open, take DOM (latest edits)
            if ($detail.find('[data-items-tbody] tr[data-item-row]').length) {
                return readItemsFromDOM($detail);
            }

            // Prefer jQuery cached data
            const d = $detail.data('items');
            if (Array.isArray(d)) return d;

            // If string, JSON parse
            if (typeof d === 'string' && d.trim() !== '') {
                try { return JSON.parse(d); } catch (e) { }
            }

            // Fallback: attribute
            const raw = $detail.attr('data-items');
            if (raw && raw.trim() !== '') {
                try { return JSON.parse(raw); } catch (e) { }
            }

            return [];
        }

        function weightLongLabel(label) {
            const s = String(label || '').trim();
            if (!s) return s;

            // --- OUNCES ---
            const oz = s.match(/^(\d+(?:\.\d+)?)\s*oz$/i);
            if (oz) {
                const num = Number(oz[1]);
                return `${oz[1]} ${num === 1 ? 'ounce' : 'ounces'}`;
            }

            // --- GRAMS ---
            const g = s.match(/^(\d+(?:\.\d+)?)\s*g$/i);
            if (g) {
                const num = Number(g[1]);
                return `${g[1]} ${num === 1 ? 'gram' : 'grams'}`;
            }

            // If already long (rare), keep as-is
            return s;
        }

        function rebuildSearchAttr($header, $detail) {
            const parts = [];

            // header fields
            parts.push($header.find('[name="purchase_date"]').val() || '');
            parts.push($header.find('[name="invoice_no"]').val() || '');
            parts.push($header.find('[name="supplier_name"]').val() || '');
            parts.push($header.find('[name="beneficiary_name"]').val() || '');
            parts.push($header.find('[name="qty"]').val() || '');

            // detail fields
            parts.push($detail.find('[name="mode_of_transaction"]').val() || '');
            parts.push($detail.find('[name="receipt_no"]').val() || '');
            parts.push($detail.find('[name="remarks"]').val() || '');
            parts.push($detail.find('[name="description"]').val() || '');

            // items fields (brand/cert/metal/shape etc)
            $detail.find('[data-items-tbody] [name]').each(function () {
                parts.push($(this).val() || '');
            });

            $header.attr('data-search', parts.join(' ').toLowerCase());
        }

        function placeMenuUnderButton($btn, $menu) {
            const r = $btn[0].getBoundingClientRect();

            // Temporarily show for measurement
            const wasHidden = $menu.hasClass('hidden');
            if (wasHidden) $menu.removeClass('hidden').css({ visibility: 'hidden' });

            // Set width first
            $menu.css({ position: 'fixed', left: 0, top: 0, width: r.width + 'px' });

            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const gap = 6;

            const btnW = r.width;

            // allow panel wider than button
            const minW = Number($menu.attr('data-minw') || 0);   // read from panel attribute
            let panelW = Math.max(btnW, minW);

            // keep inside viewport
            panelW = Math.min(panelW, vw - 16);

            // set panel width (NOT button)
            $menu.css({ position: 'fixed', left: 0, top: 0, width: panelW + 'px' });

            const spaceBelow = vh - r.bottom - gap;
            const spaceAbove = r.top - gap;

            // Prefer up on small screens, otherwise flip if not enough space below
            const preferUp = (vw < 640);
            let openUp =
                preferUp ? (spaceAbove > 140)
                    : (spaceBelow < 220 && spaceAbove > spaceBelow);

            // Apply max-height to list (so panel height is controlled)
            const $list = $menu.find('.dd2-list');
            const maxH = openUp ? Math.max(160, spaceAbove - 8) : Math.max(160, spaceBelow - 8);
            if ($list.length) $list.css({ maxHeight: maxH + 'px', overflow: 'auto' });

            // Now measure final panel height after max-height applied
            const panelH = $menu.outerHeight();

            // Compute top based on direction
            let top = openUp ? (r.top - gap - panelH) : (r.bottom + gap);

            // Clamp inside viewport vertically
            top = Math.max(8, Math.min(top, vh - panelH - 8));

            // Clamp horizontally
            let left = r.left;
            if (left + r.width > vw - 8) left = vw - r.width - 8;
            if (left < 8) left = 8;

            // Apply position
            $menu.css({
                position: 'fixed',
                top: top + 'px',
                left: left + 'px',
                width: panelW + 'px',
                zIndex: 999999,
                visibility: ''
            });

            $menu.toggleClass('dd2-open-up', openUp);

            // Restore hidden state if it was hidden before measuring
            if (wasHidden) $menu.addClass('hidden');
        }

        function openMenu($btn, $menu) {
            if (!$menu.data('ported')) {
                $menu.data('ported', true);
                $('body').append($menu);
            }

            placeMenuUnderButton($btn, $menu);
            $menu.removeClass('hidden');

            requestAnimationFrame(() => {
                requestAnimationFrame(() => placeMenuUnderButton($btn, $menu));
            });

            const onMove = () => {
                if (!$btn || !$btn.length) { closeMenu($menu); return; }

                const r = $btn[0].getBoundingClientRect();
                const vh = window.innerHeight;
                const vw = window.innerWidth;

                const outOfView = r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw;
                if (outOfView) { closeMenu($menu); return; }

                placeMenuUnderButton($btn, $menu);
            };

            $(window).on('scroll.dd2 resize.dd2', onMove);
            $('.pm-table-scroll').on('scroll.dd2', onMove);

            $menu.data('onMove', onMove);

            const onDown = function (e) {
                if ($(e.target).closest($menu).length) return;
                if ($(e.target).closest($btn).length) return;
                closeMenu($menu);
            };
            $(document).on('mousedown.dd2', onDown);
            $menu.data('onDown', onDown);

            const onEsc = function (e) {
                if (e.key === 'Escape') closeMenu($menu);
            };
            $(document).on('keydown.dd2', onEsc);
            $menu.data('onEsc', onEsc);
        }

        function closeMenu($menu) {
            $menu.addClass('hidden');

            const onMove = $menu.data('onMove');
            if (onMove) {
                $(window).off('scroll.dd2 resize.dd2', onMove);
                $('.pm-table-scroll').off('scroll.dd2', onMove);
            }

            const onDown = $menu.data('onDown');
            if (onDown) $(document).off('mousedown.dd2', onDown);

            const onEsc = $menu.data('onEsc');
            if (onEsc) $(document).off('keydown.dd2', onEsc);
        }

        // --------- Modal helpers (replace alert/confirm) ----------
        function openAppModal(opts = {}) {
            const o = Object.assign({
                type: 'info',      // info | success | error | warn | confirm
                title: 'Message',
                message: '',
                okText: 'OK',
                cancelText: 'Cancel',
                showCancel: false,
                onOk: null,
                onCancel: null
            }, opts);

            const $m = $('#appModal');
            const $title = $('#appModalTitle');
            const $msg = $('#appModalMsg');
            const $icon = $('#appModalIcon');
            const $ok = $('#appModalOk');
            const $cancel = $('#appModalCancel');

            const icons = {
                info: `<i class="bi bi-info-circle text-slate-700"></i>`,
                success: `<i class="bi bi-check-circle text-emerald-600"></i>`,
                error: `<i class="bi bi-exclamation-triangle text-rose-600"></i>`,
                warn: `<i class="bi bi-exclamation-circle text-amber-600"></i>`,
                confirm: `<i class="bi bi-question-circle text-slate-700"></i>`,
            };

            $icon.html(icons[o.type] || icons.info);
            $title.text(o.title || 'Message');
            $msg.text(o.message || '');

            $ok.text(o.okText || 'OK');
            if (o.showCancel) {
                $cancel.removeClass('hidden').text(o.cancelText || 'Cancel');
            } else {
                $cancel.addClass('hidden');
            }

            // cleanup old handlers
            $ok.off('click.appModal');
            $cancel.off('click.appModal');

            function close() {
                $m.addClass('hidden');
                $('body').removeClass('pm-modal-open');
            }

            $ok.on('click.appModal', function () {
                close();
                if (typeof o.onOk === 'function') o.onOk();
            });

            $cancel.on('click.appModal', function () {
                close();
                if (typeof o.onCancel === 'function') o.onCancel();
            });

            $('#appModalCloseX').off('click.appModal').on('click.appModal', close);
            $m.removeClass('hidden');
            $('body').addClass('pm-modal-open');
        }

        function showError(msg, title = 'Error') {
            openAppModal({ type: 'error', title, message: msg });
        }
        function showSuccess(msg, title = 'Success') {
            openAppModal({ type: 'success', title, message: msg });
        }
        function showInfo(msg, title = 'Info') {
            openAppModal({ type: 'info', title, message: msg });
        }
        function confirmModal(msg, onYes, title = 'Confirm') {
            openAppModal({
                type: 'confirm',
                title,
                message: msg,
                okText: 'Yes',
                cancelText: 'No',
                showCancel: true,
                onOk: onYes
            });
        }

        // helper (put once, near your other helpers)
        function setBtnBusy($btn, busy, label = 'Uploading...') {
            if (!$btn || !$btn.length) return;

            if (busy) {
                if ($btn.data('busy')) return;
                $btn.data('busy', true);
                $btn.data('oldHtml', $btn.html());

                $btn.prop('disabled', true).addClass('opacity-70 cursor-not-allowed');
                $btn.html(`
                    <span class="inline-flex items-center gap-2">
                        <span class="pm-spinner"></span>
                        <span>${label}</span>
                    </span>
                `);
            } else {
                $btn.data('busy', false);
                const old = $btn.data('oldHtml');
                if (old) $btn.html(old);
                $btn.prop('disabled', false).removeClass('opacity-70 cursor-not-allowed');
            }
        }

        function setBtnLoading($btn, on) {
            if (!$btn || !$btn.length) return;

            if (on) {
                // store original icon html
                $btn.data('old-html', $btn.html());

                $btn.prop('disabled', true)
                    .addClass('opacity-70 cursor-not-allowed');

                // spinner only (icon-style)
                $btn.html(`<span class="pm-spinner"></span>`);
            } else {
                const old = $btn.data('old-html');
                if (old) $btn.html(old);

                $btn.prop('disabled', false)
                    .removeClass('opacity-70 cursor-not-allowed');
            }
        }

        function fmtMoneyAED(val) {
            const n = Number(unformat(val));
            if (!Number.isFinite(n)) return '';
            return 'AED ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        const MONEY_SEL = '.pm-money';

        $tbody.on('focus', MONEY_SEL, function () {
            $(this).data('lastValid', $(this).val() ?? '');
            $(this).val(unformat($(this).val()));
        });

        $tbody.on('blur', MONEY_SEL, function () {
            const raw = unformat($(this).val()).trim();
            if (raw === '') { $(this).data('lastValid', ''); return; }

            const n = Number(raw);
            if (!Number.isFinite(n)) {
                $(this).val($(this).data('lastValid') || '');
                return;
            }

            const formatted = fmtMoneyAED(n);
            $(this).val(formatted);
            $(this).data('lastValid', formatted);
        });

        $tbody.on('input', MONEY_SEL, function () {
            let v = String(this.value || '').replace(/[^0-9.]/g, '');
            const parts = v.split('.');
            if (parts.length > 2) v = parts.shift() + '.' + parts.join('');
            this.value = v;
        });

        // Add new row (at bottom)
        $('#openCreate').on('click', function () {
            addNewRow();
        });

        function initDetailDropdowns($scope) {
            // weight dropdowns (if any)
            $scope.find('.pm-weight-select').each(function () {
                buildWeightDropdown($(this));
            });

            // item-level metal_type
            $scope.find('select[name$="[metal_type]"]').each(function () {
                buildCustomDropdown($(this), { placeholder: 'Select Metal' });
            });

            // item-level metal_shape
            $scope.find('select[name$="[metal_shape]"]').each(function () {
                buildCustomDropdown($(this), { placeholder: 'Select Shape' });
            });

            // shared mode_of_transaction (this one is NOT inside items[], so keep exact)
            $scope.find('select[name="mode_of_transaction"]').each(function () {
                buildCustomDropdown($(this), { placeholder: 'Select Mode' });
            });
        }

        function addNewRow() {
            $('body').find('.dd2-panel').each(function () {
                closeMenu($(this));
            });

            if ($tbody.find('tr[data-draft="1"]').length) return;

            $tbody.find('tr[data-empty="1"]').remove();
            $tbody.find('tr[data-empty-filter="1"]').remove();

            const tmpId = 'tmp_' + Date.now();

            const $header = $('#newHeaderTemplate').clone(false)
                .removeAttr('id')
                .attr('data-draft', '1')
                .attr('data-tmp', tmpId);

            const $detail = $('#newDetailTemplate').clone(false)
                .removeAttr('id')
                .attr('data-draft', '1')
                .attr('data-detail-for', tmpId)
                .addClass('hidden'); // start hidden so openDetailRow() animates correctly

            $tbody.append($header, $detail);

            // default mode to bank for new draft
            $detail.find('select[name="mode_of_transaction"]').val('bank').trigger('change');

            renderItemsTable($header.add($detail));

            $header.add($detail).removeClass('view-mode').addClass('editing');
            $header.add($detail).find('.gts-editable').prop('disabled', false);

            // reset any existing custom dropdown UI inside this cloned template
            $detail.find('.dd2').remove();
            $detail.find('select')
                .removeClass('hidden')
                .css('display', '')
                .removeData('ddBuilt');

            // build ALL detail dropdowns one time here
            initDetailDropdowns($detail);

            openDetailRow($detail);

            reindexVisible();
            $header.find('input[name="purchase_date"]').trigger('focus');
        }

        function metalIconHtml(metal) {
            const m = String(metal || '').toLowerCase();

            // Premium inline SVG icons (uses currentColor)
            if (m === 'gold') {
                // stacked coins
                return `
                <svg class="pm-metal-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <ellipse cx="12" cy="6.5" rx="6.8" ry="2.8" stroke="currentColor" stroke-width="1.7"/>
                    <path d="M5.2 6.5v4.0c0 1.6 3.0 2.9 6.8 2.9s6.8-1.3 6.8-2.9v-4.0" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                    <path d="M7.4 10.2c1.1.6 2.7 1 4.6 1s3.5-.4 4.6-1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                    <path d="M7 15.2h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".75"/>
                    <path d="M8.2 18.2h7.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".6"/>
                </svg>
                `;
            }

            if (m === 'silver') {
                // single coin
                return `
                <svg class="pm-metal-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="7.2" stroke="currentColor" stroke-width="1.7"/>
                    <circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.7" opacity=".85"/>
                    <path d="M9.2 9.2l5.6 5.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".55"/>
                    <path d="M14.8 9.2l-5.6 5.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".25"/>
                </svg>
                `;
            }

            if (m === 'platinum') {
                // ingot/bar
                return `
                <svg class="pm-metal-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M7 8.8 10 6h9l-3 2.8H7Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                    <path d="M7 8.8h9v10A1.6 1.6 0 0 1 14.4 20H8.6A1.6 1.6 0 0 1 7 18.8v-10Z" stroke="currentColor" stroke-width="1.7"/>
                    <path d="M10 6v2.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                    <path d="M9.2 13h4.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".75"/>
                </svg>
                `;
            }

            if (m === 'miscellaneous') {
                // sparkles
                return `
                <svg class="pm-metal-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 3l.9 2.7L15.6 6.6l-2.7.9L12 10.2l-.9-2.7-2.7-.9 2.7-.9L12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                    <path d="M18.5 10.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" opacity=".85"/>
                    <path d="M6 12.2l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" opacity=".7"/>
                </svg>
                `;
            }

            // fallback
            return `
                <svg class="pm-metal-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                </svg>
            `;
        }

        // ---------- helpers ----------
        function rowSnapshot($group) {
            const data = {};
            $group.find('input[name], select[name], textarea[name]').each(function () {
                data[this.name] = $(this).val() ?? '';
            });
            return data;
        }

        function num(v) {
            return Number(String(v ?? 0).replace(/[^0-9.\-]/g, '')) || 0;
        }

        function calcRowPurchaseTotal(items) {
            return (items || []).reduce((sum, it) => sum + num(it.purchase_price), 0);
        }

        function updateHeaderPurchaseTotal($header, $detail) {
            if (!$header?.length) return;
            if (!$detail?.length) return;

            const items = getItemsForDetail($detail); // uses DOM if open, else data-items
            const total = calcRowPurchaseTotal(items);

            $header.find('.pm-row-total').val(formatAED(total));
        }

        // ---------- Items (repeated by qty) ----------
        function getQtyFromGroup($group) {
            const q = Number($group.find('input[name="qty"]').first().val() || 1);
            return Math.max(1, Math.floor(q));
        }

        // Read current items from DOM (so we can preserve values when re-rendering)
        function readItemsFromDOM($detail) {
            const items = [];

            $detail.find('[data-items-tbody] tr[data-item-row]').each(function () {
                const $tr = $(this);
                const idx = Number($tr.attr('data-item-row')) || 0;

                items[idx] = items[idx] || {};

                $tr.find('input[name], select[name], textarea[name]').each(function () {
                    const name = this.name || '';
                    const m = name.match(/^items\[\d+\]\[([^\]]+)\]$/);
                    if (!m) return;

                    const key = m[1];
                    let val = $(this).val() ?? '';

                    // weight: if custom selected, take custom input, else take select value
                    if (key === 'weight') {
                        if ($(this).is('select') && String(val) === 'custom') {
                            val = ($tr.find('.pm-weight-custom').val() || '').trim();
                        } else {
                            val = String(val || '').trim();
                        }

                        // normalize to numeric string if possible
                        val = normalizeWeightToOptionValue(val);
                        items[idx][key] = val;
                        return;
                    }

                    // currency: store raw numeric (no AED / commas)
                    if (key === 'purchase_price' || key === 'sell_price') {
                        val = unformat(val);
                    }

                    if (key === 'pcs') {
                        val = String(val || '').replace(/[^\d]/g, '');
                    }

                    items[idx][key] = val;
                });
            });

            return items;
        }

        function toggleCoinFields($tr) {
            const shape = String($tr.find('select[name$="[metal_shape]"]').val() || '').toLowerCase();
            const isCoin = (shape === 'coin');

            const $certWrap = $tr.find('.pm-field-cert-wrap');
            const $pcs = $tr.find('input[name$="[pcs]"]');

            // always show certificate (new rule)
            if ($certWrap.length) $certWrap.removeClass('hidden');

            // PCS always visible, just make it required for coin if you want
            $pcs.prop('required', isCoin);
        }

        // Build ONE item row HTML (all repeated fields live here)
        function itemRowHtml(i) {
            const n = i + 1;

            return `
            <tr data-item-row="${i}" class="border-b border-slate-100">
                <td class="px-3 py-3">
                <!-- Item wrapper -->
                <div class="rounded-2xl pm-item-wrap pm-items-dark shadow-sm overflow-hidden relative">

                    <!-- closed badge -->
                    <div class="pm-item-closed hidden" data-closed-badge>Closed</div>

                    <!-- edit (unlock) button -->
                    <button type="button"
                        class="pm-item-editbtn hidden"
                        data-action="unlock-sold-item"
                        title="Edit Sold Item">
                        <i class="bi bi-pencil-square"></i>
                    </button>

                    <!-- Item header -->
                    <div class="pm-item-badge-wrap">
                        <span class="pm-items-badge">Item ${n}</span>
                    </div>

                    <!-- MAIN LAYOUT: 3:1 -->
                    <div class="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:items-stretch p-4 pt-0">

                        <!-- LEFT (span 3): image + 2 columns -->
                        <div class="lg:col-span-3 rounded-2xl pm-items-surface p-4 lg:h-full">
                            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

                            <!-- (1) PREVIEW -->
                            <div class="pm-preview is-empty" data-preview>
                                <div class="pm-preview-imgwrap">
                                    <img class="pm-preview-img" data-preview-img alt="">
                                    <div class="pm-preview-badge" data-preview-badge>—</div>
                                </div>
                                <div class="pm-preview-meta">
                                    <div class="pm-preview-head">
                                        <div>
                                        <div class="pm-preview-title" data-preview-title>—</div>
                                        <div class="pm-preview-sub" data-preview-sub>—</div>
                                        </div>

                                        <div class="pm-preview-actions">
                                        <input type="file" accept="image/*" class="pm-preview-file hidden" data-preview-file>

                                        <button type="button"
                                            class="pm-preview-iconbtn"
                                            data-action="item-img-upload"
                                            data-no-toggle="1"
                                            title="Upload Photo">
                                            <i class="bi bi-image"></i>
                                        </button>

                                        <button type="button"
                                            class="pm-preview-iconbtn pm-preview-iconbtn--danger hidden"
                                            data-action="item-img-remove"
                                            data-no-toggle="1"
                                            title="Remove Photo">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <input type="hidden" name="items[${i}][image_path]" value="">

                            <!-- (2) COL A: Brand / Metal / PCS -->
                            <div class="space-y-3">
                                <div>
                                    <div class="pm-items-label mb-1">Brand</div>
                                    <input name="items[${i}][brand_name]" class="gts-input gts-editable" disabled>
                                </div>

                                <div>
                                    <div class="pm-items-label mb-1">Metal</div>
                                    <select name="items[${i}][metal_type]" class="gts-select gts-editable" disabled>
                                        <option value="">Select</option>
                                        <option value="gold">Gold</option>
                                        <option value="silver">Silver</option>
                                        <option value="platinum">Platinum</option>
                                        <option value="miscellaneous">Miscellaneous</option>
                                    </select>
                                </div>

                                <div class="pm-field-pcs-wrap">
                                    <div class="pm-items-label mb-1">PCS</div>
                                    <input name="items[${i}][pcs]" type="number" min="1" inputmode="numeric"
                                            class="gts-input gts-editable pm-pcs-input" disabled>
                                </div>
                            </div>

                            <!-- (3) COL B: Certificate / Shape / Weight -->
                            <div class="space-y-3">
                                <div class="pm-field-cert-wrap">
                                    <div class="pm-items-label mb-1">Certificate</div>
                                    <input name="items[${i}][certificate_no]" class="gts-input gts-editable" disabled>
                                </div>

                                <div>
                                    <div class="pm-items-label mb-1">Shape</div>
                                    <select name="items[${i}][metal_shape]" class="gts-select gts-editable" disabled>
                                        <option value="">Select</option>
                                        <option value="bar">Bar</option>
                                        <option value="coin">Coin</option>
                                        <option value="granules">Granules</option>
                                        <option value="packs">Packs</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>

                                <div>
                                    <div class="pm-items-label mb-1">Weight</div>
                                    <div class="pm-weight-wrap space-y-1">
                                        <select class="pm-weight-select gts-select gts-editable w-full" name="items[${i}][weight]" disabled>
                                            <option value="">Select</option>

                                            <optgroup label="GRAMS (G)">
                                            <option value="5">5 g</option>
                                            <option value="10">10 g</option>
                                            <option value="15">15 g</option>
                                            <option value="20">20 g</option>
                                            <option value="50">50 g</option>
                                            <option value="100">100 g</option>
                                            </optgroup>

                                            <optgroup label="OUNCES (OZ)">
                                            <option value="31.1035">1 oz</option>
                                            <option value="62.207">2 oz</option>
                                            <option value="155.5175">5 oz</option>
                                            <option value="311.035">10 oz</option>
                                            </optgroup>

                                            <option value="custom">Custom…</option>
                                        </select>

                                        <input type="number" step="0.001" min="0"
                                            class="pm-weight-custom gts-input gts-editable hidden"
                                            data-weight-custom-for="${i}"
                                            placeholder="Enter custom weight"
                                            disabled>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                    <!-- RIGHT (span 1): Purchase/Sell/Sell Date -->
                    <div class="lg:col-span-1 rounded-2xl pm-items-surface p-4 lg:h-full">
                        <div class="grid grid-cols-1 gap-3">
                            <div>
                                <div class="pm-items-label mb-1">Purchase (AED)</div>
                                <input name="items[${i}][purchase_price]" type="text" inputmode="decimal" class="gts-input gts-editable" disabled>
                            </div>

                            <div>
                                <div class="pm-items-label mb-1">Sell (AED)</div>
                                <input name="items[${i}][sell_price]" type="text" inputmode="decimal" class="gts-input gts-editable" disabled>
                            </div>

                            <div class="pm-diff-wrap hidden" data-diff-wrap>
                                <div class="pm-items-label mb-1">Difference</div>
                                <div class="pm-diff-pill pm-diff-neutral" data-diff-pill>—</div>
                            </div>

                            <div>
                                <div class="pm-items-label mb-1">Sell Date</div>
                                <input name="items[${i}][sell_date]" type="date" class="gts-input gts-editable" disabled>
                            </div>

                            <!-- compact toolbar -->
                            <div class="pm-sell-toolbar mt-2">
                                <!-- left: small locate button (shows only when sold) -->
                                <button type="button"
                                    class="pm-show-summary-btn hidden pm-sold-locate-btn"
                                    data-action="show-in-summary"
                                    title="View in Sold Summary">
                                    <i class="bi bi-bullseye"></i>
                                    <span class="pm-sr-only">View in Sold Summary</span>
                                </button>

                                <!-- right: icon-only actions -->
                                <div class="pm-sell-icons">
                                    <button type="button"
                                    class="pm-sell-iconbtn pm-sell-iconbtn--upload"
                                    data-action="sell-upload"
                                    data-no-toggle="1"
                                    title="Sell Upload">
                                    <i class="bi bi-cloud-arrow-up"></i>
                                    <span class="pm-sr-only">Sell Upload</span>
                                    </button>

                                    <button type="button"
                                    class="pm-sell-iconbtn pm-sell-iconbtn--view"
                                    data-action="sell-view"
                                    data-no-toggle="1"
                                    title="Sell View">
                                    <i class="bi bi-paperclip"></i>
                                    <span class="pm-sr-only">Sell View</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
                </div>
                </td>
            </tr>
            `;
        }

        // Render / Re-render items table
        function renderItemsTable($group, seedItems = null) {
            const $detail = $group.filter('tr.pm-detail').first();
            if (!$detail.length) return;

            const qty = getQtyFromGroup($group);
            const $tb = $detail.find('[data-items-tbody]').first();
            if (!$tb.length) return;

            // if seedItems provided, use it. otherwise preserve from DOM
            const prev = Array.isArray(seedItems) ? seedItems : readItemsFromDOM($detail);

            $tb.html(Array.from({ length: qty }, (_, i) => itemRowHtml(i)).join(''));

            prev.forEach((obj, idx) => {
                if (!obj) return;

                Object.keys(obj).forEach(k => {
                    let v = obj[k] ?? '';

                    if (k === 'sell_date') v = asDate(v);
                    if (k === 'metal_shape') v = normShape(v);
                    if (k === 'metal_type') v = normMetal(v);

                    const name = `items[${idx}][${k}]`;
                    const $el = $tb.find(`[name="${CSS.escape(name)}"]`);
                    if (!$el.length) return;

                    if (k === 'weight') {
                        const raw = (v ?? '').toString().trim();
                        const $sel = $el;                 // this select
                        const $tr = $sel.closest('tr');   // define row
                        const $custom = $tr.find('.pm-weight-custom');

                        if (!raw) {
                            $sel.val('').trigger('change');
                            $custom.val('').addClass('hidden');
                            return;
                        }

                        const w = normalizeWeightToOptionValue(raw);

                        const near = (a, b, eps = 0.0005) => Math.abs(a - b) <= eps;
                        const target = parseFloat(w);

                        let matchedVal = '';
                        if (Number.isFinite(target)) {
                            $sel.find('option').each(function () {
                                const ov = String(this.value ?? '').trim();
                                const on = parseFloat(ov);
                                if (!ov) return;
                                if (Number.isFinite(on) && near(on, target)) {
                                    matchedVal = ov;
                                    return false;
                                }
                            });
                        }

                        if (matchedVal) {
                            $sel.val(matchedVal).trigger('change');
                            $custom.val('').addClass('hidden');
                        } else {
                            $sel.val('custom').trigger('change');
                            $custom.val(raw).removeClass('hidden');
                        }

                        return;
                    }

                    if (k === 'purchase_price') v = v ? fmtMoneyAED(v) : '';
                    if (k === 'sell_price') v = v ? fmtMoneyAED(v) : '';

                    if (k === 'pcs') {
                        v = String(v || '').replace(/[^\d]/g, '');
                    }

                    // NORMAL SETTER (all other keys)
                    $el.val(v);

                    // if it's a select, trigger change so dd2 label updates
                    if ($el.is('select')) $el.trigger('change');
                });
            });

            // keep draft row / editing row inputs enabled even after qty re-render
            const $header = $group.filter('tr.pm-header').first();
            const shouldEnable =
                ($header.hasClass('editing')) ||
                ($header.attr('data-draft') === '1') ||
                ($detail.attr('data-draft') === '1');

            $detail.find('.gts-editable').prop('disabled', !shouldEnable);

            // rebuild dropdown UI after setting values
            $detail.find('.dd2').remove();
            $detail.find('select').removeClass('hidden').css('display', '').removeData('ddBuilt');
            initDetailDropdowns($detail);

            $detail.find('tr[data-item-row]').each(function () {
                const $row = $(this);
                toggleCoinFields($row);
                updateItemPreview($row);
                applySellVsPurchaseHighlight($row);
            });

            updateHeaderPurchaseTotal($header, $detail);
            toggleShowSummaryBtn($detail);
            toggleSellButtons($detail);
            updateHeaderSoldCount($header, $detail);

            refreshDetailHeight($detail);
            setTimeout(() => refreshDetailHeight($detail), 50);
        }

        function flashTileInPane(rootSel, metal, shape, weightLabel) {
            // build summary already happened via setInvView('sold')
            // wait 1 frame so DOM updates & height sync completes
            requestAnimationFrame(() => {
                const $tile = $(`${rootSel} .pmTile[data-metal="${metal}"][data-shape="${shape}"][data-weight="${weightLabel}"]`).first();
                if (!$tile.length) return;

                // scroll the tile into view inside the summary section
                $tile[0].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

                $tile.addClass('pmTileFlash');
                setTimeout(() => $tile.removeClass('pmTileFlash'), 1400);
            });
        }

        $tbody.on('click', '[data-action="show-in-summary"]', function (e) {
            e.preventDefault();
            e.stopPropagation();

            const $itemRow = $(this).closest('tr[data-item-row]');

            const metal = normMetal($itemRow.find('select[name$="[metal_type]"]').val());
            const shape = normShape($itemRow.find('select[name$="[metal_shape]"]').val());
            const wRaw = $itemRow.find('select[name$="[weight]"]').val() || $itemRow.find('.pm-weight-custom').val();
            const shortW = weightLabelFromValue(wRaw);

            if (!metal || !shape || !shortW) {
                showInfo('Please fill Metal, Shape and Weight to locate it in Inventory Summary.');
                return;
            }

            // switch to SOLD view
            setInvView('sold');

            // flash in SOLD pane only
            flashTileInPane('#invSummarySold', metal, shape, shortW);
        });

        function updateTotalsFromDOM($headers = null) {
            let purchaseTotal = 0;
            let sellTotal = 0;

            const $hs = ($headers && $headers.length) ? $headers : getVisibleHeaders();

            $hs.each(function () {
                const id = $(this).data('id');
                const $detail = $tbody.find(`tr.pm-detail[data-detail-for="${id}"]`);
                const items = getItemsForDetail($detail);

                items.forEach(it => {
                    purchaseTotal += num(it.purchase_price);
                    sellTotal += num(it.sell_price);
                });
            });

            $('#totalPurchase').text(formatAED(purchaseTotal));
            $('#totalSell').text(formatAED(sellTotal));
        }

        function metalIconPngHtml(metal, shape, idx) {
            const m = String(metal || 'unknown').toLowerCase();
            const s = String(shape || 'bar').toLowerCase();

            // only coin uses coin image, everything else uses bar image
            const wantsCoin = (s === 'coin');

            const IMG = {
                gold: { bar: '/images/metals/goldbar.png', coin: '/images/metals/goldcoin.png' },
                silver: { bar: '/images/metals/silverbar.png', coin: '/images/metals/silvercoin.png' },
                platinum: { bar: '/images/metals/platinumbar.png', coin: '/images/metals/platinumcoin.png' },
                miscellaneous: { bar: '/images/metals/miscbar.png', coin: '/images/metals/misccoin.png' },
                unknown: { bar: '/images/metals/miscbar.png', coin: '/images/metals/misccoin.png' }
            };

            const pack = IMG[m] || IMG.unknown;
            const src = wantsCoin ? (pack.coin || pack.bar) : pack.bar;

            // stronger variety (rotation + tiny translate + scale)
            const variants = [
                'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10'
            ];
            const v = variants[idx % variants.length];
            const typeClass = wantsCoin ? 'pm-img--coin' : 'pm-img--bar';

            return `
                <img
                src="${src}"
                alt="${m} ${wantsCoin ? 'coin' : 'bar'}"
                class="pm-metal-img ${typeClass} ${v}"
                loading="lazy"
                />
            `;
        }

        function buildSummaryFromDOM($headers = null) {
            tileIdx = 0;

            const stockRows = [];
            const soldRows = [];

            const $hs = $headers && $headers.length ? $headers : getVisibleHeaders();

            $hs.each(function () {
                const id = $(this).data('id');
                const $detail = $tbody.find(`tr.pm-detail[data-detail-for="${id}"]`);
                const items = getItemsForDetail($detail);

                items.forEach(it => {
                    const sellP = String(it.sell_price ?? '').trim();
                    const sellD = String(it.sell_date ?? '').trim();
                    const isSold = (num(sellP) > 0) || !!sellD;

                    const hasAny =
                        String(it.brand_name ?? '').trim() ||
                        String(it.certificate_no ?? '').trim() ||
                        String(it.metal_type ?? '').trim() ||
                        String(it.metal_shape ?? '').trim() ||
                        String(it.weight ?? '').trim() ||
                        String(it.purchase_price ?? '').trim() ||
                        String(it.sell_price ?? '').trim();

                    if (!hasAny) return;

                    const metal = normMetal(it.metal_type) || 'unknown';
                    const shape = normShape(it.metal_shape) || 'other';
                    const weightLabel = weightLabelFromValue(it.weight);

                    let pcs = parseInt(String(it.pcs ?? '').replace(/[^\d]/g, ''), 10);
                    pcs = Number.isFinite(pcs) && pcs > 0 ? pcs : 1;

                    const gramsPerItem = toGramsFromWeightLabel(weightLabel);
                    const totalGrams = gramsPerItem * pcs;

                    const p = num(it.purchase_price);
                    const s = num(it.sell_price);
                    const purchaseTotal = p * pcs;
                    const sellTotal = s * pcs;
                    const sellDate = asDate(it.sell_date);

                    const row = { metal, shape, weightLabel, pcs, totalGrams, purchaseTotal, sellTotal, sellDate };

                    if (isSold) soldRows.push(row);
                    else stockRows.push(row);
                });
            });

            const invStock = buildInvMap(stockRows);
            const invSold = buildInvMap(soldRows);
            const activeInv = (ACTIVE_INV_VIEW === 'sold') ? invSold : invStock;

            // rows to drive totals/cards depending on view
            const activeRows = (ACTIVE_INV_VIEW === 'sold') ? soldRows : stockRows;

            if (!activeRows.length) {
                $('#metalPicker').html('');

                const $target = (ACTIVE_INV_VIEW === 'sold')
                    ? $('#invSummarySold')
                    : $('#invSummaryStock');

                // clear the other pane too (prevents old view staying behind)
                $('#invSummaryStock').html('');
                $('#invSummarySold').html('');

                $target.html(`
                    <div class="p-4 rounded-2xl border border-slate-200 text-slate-400 text-center bg-white">
                        No data
                    </div>
                `);
                syncInvWrapHeight();
                return;
            }

            // ---- Weight totals ----
            const gramsByMetal = { gold: 0, silver: 0, platinum: 0, miscellaneous: 0, unknown: 0 };

            activeRows.forEach(r => {
                const g = Number(r.totalGrams) || 0;

                const mm = String(r.metal || 'unknown').toLowerCase().trim();
                const key = (mm === 'misc' ? 'miscellaneous' : mm);

                gramsByMetal[key] = (gramsByMetal[key] || 0) + g;
            });

            const order = [
                { k: 'gold', label: 'Gold' },
                { k: 'silver', label: 'Silver' },
                { k: 'platinum', label: 'Platinum' },
                { k: 'miscellaneous', label: 'Misc' },
            ];

            const statCards = order
                .filter(x => (gramsByMetal[x.k] || 0) > 0)
                .map(x => `
                    <div class="pmWCard pmWCard--${x.k}">
                    <div class="pmWCardLabel">${x.label}</div>
                    <div class="pmWCardVal">${fmtWeightCompact(gramsByMetal[x.k])}</div>
                    </div>
                `).join('') || `<div class="pmWEmpty">No weight data.</div>`;

            const weightBarHtml = `
                <div class="pmWBar2">
                    <div class="pmWBar2Top">
                        <div>
                            <div class="pmWBar2Title">${ACTIVE_INV_VIEW === 'sold' ? 'Total Weight (Sold)' : 'Total Weight (In Stock)'}</div>
                            <div class="pmWBar2Sub">${ACTIVE_INV_VIEW === 'sold' ? 'Sold items only • weight × pcs' : 'Sold items excluded • weight × pcs'}</div>
                        </div>
                    </div>

                    <div class="pmWBar2Grid">
                        ${statCards}
                    </div>
                </div>
                `;

            $('#invWeightBar').html(weightBarHtml);

            const pretty = (s) => (s || '—').replace(/\b\w/g, c => c.toUpperCase());
            const metalOrder = ['gold', 'silver', 'platinum', 'miscellaneous', 'unknown'];

            const inv = activeInv;

            // which metals exist (ordered)
            const metalsPresent = metalOrder.filter(m => inv.has(m));
            const multipleMetals = metalsPresent.length > 1;

            // --- Metal Picker (only show when >1 metal)
            if (multipleMetals) {
                // if active metal is invalid, default to first
                if (!ACTIVE_METAL || !inv.has(ACTIVE_METAL)) ACTIVE_METAL = metalsPresent[0];

                const tabHtml = `
                    <div class="pm-metal-tabs">
                        ${metalsPresent.map(m => {
                    const count = Array.from(inv.get(m).values())          // shapes
                        .flatMap(wMap => Array.from(wMap.values()))          // {pcs,...}
                        .reduce((a, obj) => a + (obj.pcs || 0), 0);
                    const badgeClass =
                        m === 'gold' ? 'pm-metal-badge--gold' :
                            m === 'silver' ? 'pm-metal-badge--silver' :
                                m === 'platinum' ? 'pm-metal-badge--platinum' :
                                    m === 'miscellaneous' ? 'pm-metal-badge--misc' : 'pm-metal-badge--misc';

                    const active = (m === ACTIVE_METAL) ? 'is-active' : '';

                    return `
                                <div class="pm-metal-tab ${active}" data-metal-tab="${m}">
                                    <div class="pm-metal-badge ${badgeClass}">${m === 'gold' ? 'Au' : m === 'silver' ? 'Ag' : m === 'platinum' ? 'Pt' : '•'}</div>
                                    <div>
                                    <div class="pm-metal-name">${pretty(m)}</div>
                                    <div class="pm-metal-sub">${count} pcs</div>
                                    </div>
                                </div>
                                `;
                }).join('')}
                        </div>
                    `;
                $('#metalPicker').html(tabHtml);
            } else {
                // only one metal -> hide picker and show that metal fully
                $('#metalPicker').html('');
                ACTIVE_METAL = metalsPresent[0];
            }

            // --- Render Inventory (only ACTIVE_METAL)
            const m = ACTIVE_METAL;
            const shapeMap = inv.get(m) || new Map();

            const metalCount = Array.from(shapeMap.values())              // weightMaps
                .flatMap(wMap => Array.from(wMap.values()))                 // {pcs,...}
                .reduce((a, obj) => a + (obj.pcs || 0), 0);

            // choose which shapes to render based on ACTIVE_SHAPE
            const shapesToRender =
                (ACTIVE_SHAPE && ACTIVE_SHAPE !== 'All')
                    ? [[ACTIVE_SHAPE, shapeMap.get(ACTIVE_SHAPE)]]
                    : Array.from(shapeMap.entries());

            // build tiles from chosen shapes
            const tiles = shapesToRender
                .filter(([shapeKey, wMap]) => wMap && wMap.size)
                .flatMap(([shapeKey, wMap]) => {
                    return Array.from(wMap.entries())
                        .sort((a, b) => (b[1].pcs || 0) - (a[1].pcs || 0))
                        .map(([wLabel, agg]) => {
                            const count = agg.pcs || 0;
                            const shortW = String(wLabel || '').trim();              // e.g. "1 oz"
                            const longW = weightLongLabel(shortW);                 // e.g. "1 ounce"

                            const safeShort = escapeHtml(shortW);
                            const safeLong = escapeHtml(longW);
                            const idx = tileIdx++;
                            const accent = tileAccentClass(idx);
                            const icon = metalIconPngHtml(m, shapeKey, idx);

                            const soldExtra = (ACTIVE_INV_VIEW === 'sold') ? (() => {
                                const pTot = agg.purchaseTotal || 0;
                                const sTot = agg.sellTotal || 0;
                                const dTot = sTot - pTot;

                                const cls = diffClass(pTot, sTot);
                                const diffTxt = (dTot >= 0 ? '+' : '-') + fmtMoneyAED(Math.abs(dTot)).replace('AED ', 'AED ');

                                const dateHtml = agg.sellDate
                                    ? `<div class="pmSoldRow"><span class="pmSoldKey">Sell Date</span><span class="pmSoldVal">${escapeHtml(agg.sellDate)}</span></div>`
                                    : '';

                                return `
                                    <div class="pmSoldMeta">
                                    <div class="pmSoldRow">
                                        <span class="pmSoldKey">Purchase</span>
                                        <span class="pmSoldVal">${fmtMoneyAED(pTot)}</span>
                                    </div>

                                    <div class="pmSoldRow">
                                        <span class="pmSoldKey">Sell</span>
                                        <span class="pmSoldVal">${fmtMoneyAED(sTot)}</span>
                                    </div>

                                    <div class="pmSoldRow">
                                        <span class="pmSoldKey">Difference</span>
                                        <span class="pmSoldDiff ${cls}">${escapeHtml(diffTxt)}</span>
                                    </div>

                                    ${dateHtml}
                                    </div>
                                `;
                            })() : '';

                            return `
                            <div class="pmTile ${accent}" data-metal="${escapeHtml(m)}" data-shape="${escapeHtml(shapeKey)}" data-weight="${escapeHtml(shortW)}">
                                <div class="pmTileTop">
                                <div class="pmTileImg">${icon}</div>

                                <div class="pmTileTxt">
                                    <div class="pmTileWeight">${safeShort}</div>
                                    <div class="pmTileMeta">${pretty(m)} ${prettyShape(shapeKey)}</div>
                                </div>
                                </div>

                                <div class="pmTileBottom">
                                    <div class="pmTileWeightOnly">${safeLong}</div>

                                    <div class="pmTilePill pmTilePill--pcs pmTilePill--radial">
                                        ${count} ${count === 1 ? 'pc' : 'pcs'}
                                    </div>
                                </div>
                                ${soldExtra}
                            </div>
                            `;
                        });
                })
                .join('');

            const icon = metalIconHtml(m);

            if (ACTIVE_INV_VIEW === 'sold') {
                $('#invSummaryStock').empty();
            } else {
                $('#invSummarySold').empty();
            }

            const html = `
                <div class="pm-inv-card" data-metal="${m}">
                    <div class="pm-inv-head">
                    <div class="pm-inv-title pm-inv-title--icon">
                        <span class="pm-inv-metal-icon">${icon}</span>
                        <div class="pm-inv-title-text">
                        <div class="pm-inv-metal-name">${pretty(m)}</div>
                        <div class="pm-inv-subline">${ACTIVE_INV_VIEW === 'sold' ? 'Sold summary' : 'In stock summary'}</div>
                        </div>
                    </div>

                    <div class="pm-inv-count">${metalCount} pcs</div>
                    </div>

                    <div class="pm-inv-grid">
                    ${tiles}
                    </div>
                </div>
            `;

            if (ACTIVE_INV_VIEW === 'sold') $('#invSummarySold').html(html);
            else $('#invSummaryStock').html(html);

            syncInvWrapHeight();
            setTimeout(syncInvWrapHeight, 80);

            function prettyShape(s) {
                const map = {
                    bar: 'Bar',
                    coin: 'Coin',
                    granules: 'Granules',
                    packs: 'Packs',
                    other: 'Other',
                    unknown: 'Other'
                };
                const k = String(s || '').toLowerCase();
                return map[k] || (k.charAt(0).toUpperCase() + k.slice(1));
            }

            // Build shape tabs for ACTIVE_METAL
            const shapeMapForMetal = inv.get(ACTIVE_METAL) || new Map();

            // If active shape is invalid, reset to All
            if (ACTIVE_SHAPE !== 'All' && !shapeMapForMetal.has(ACTIVE_SHAPE)) {
                ACTIVE_SHAPE = 'All';
            }

            // Count pcs per shape
            const shapeCounts = [];
            shapeMapForMetal.forEach((weightMap, shapeKey) => {
                const pcs = Array.from(weightMap.values())
                    .reduce((a, obj) => a + (obj.pcs || 0), 0);
                shapeCounts.push({ shapeKey, pcs });
            });

            // Sort by pcs desc (optional)
            shapeCounts.sort((a, b) => b.pcs - a.pcs);

            // Render tabs
            let shapeTabsHtml = `
                <button class="pmShapeTab ${ACTIVE_SHAPE === 'All' ? 'is-active' : ''}" data-shape="All">
                    All <span class="pmShapeCount">${shapeCounts.reduce((t, x) => t + x.pcs, 0)}</span>
                </button>
            `;

            shapeCounts.forEach(x => {
                shapeTabsHtml += `
                    <button class="pmShapeTab ${ACTIVE_SHAPE === x.shapeKey ? 'is-active' : ''}" data-shape="${x.shapeKey}">
                    ${prettyShape(x.shapeKey)} <span class="pmShapeCount">${x.pcs}</span>
                    </button>
                `;
            });

            $('#pmShapeTabs').html(shapeTabsHtml);

            function buildInvMap(rowsArr) {
                // metal -> shape -> weightLabel -> { pcs, purchaseTotal, sellTotal }
                const inv = new Map();

                rowsArr.forEach(r => {
                    if (!inv.has(r.metal)) inv.set(r.metal, new Map());
                    const shapeMap = inv.get(r.metal);

                    if (!shapeMap.has(r.shape)) shapeMap.set(r.shape, new Map());
                    const weightMap = shapeMap.get(r.shape);

                    if (!weightMap.has(r.weightLabel)) {
                        weightMap.set(r.weightLabel, { pcs: 0, purchaseTotal: 0, sellTotal: 0, sellDate: '' });
                    }
                    const agg = weightMap.get(r.weightLabel);

                    agg.pcs += (r.pcs || 1);
                    agg.purchaseTotal += (r.purchaseTotal || 0);
                    agg.sellTotal += (r.sellTotal || 0);

                    if (r.sellDate && (!agg.sellDate || String(r.sellDate) > String(agg.sellDate))) {
                        agg.sellDate = r.sellDate;
                    }
                });

                return inv;
            }

            function diffClass(p, s) {
                const eps = 0.0001;
                if (Math.abs(s - p) <= eps) return 'pmDiffSame';
                return (s > p) ? 'pmDiffBad' : 'pmDiffGood'; // sell>purchase red, sell<purchase green
            }
        }

        $tbody.find('tr.pm-header[data-id]').each(function () {
            const $h = $(this);
            const id = $h.data('id');
            const $d = $tbody.find(`tr.pm-detail[data-detail-for="${id}"]`);
            updateHeaderPurchaseTotal($h, $d);
            updateHeaderSoldCount($h, $d);
        });

        function openDetailForHeader($header) {
            const id = $header.data('id');
            if (!id) return;

            const $detail = $tbody.find(`tr.pm-detail[data-detail-for="${id}"]`);
            const $group = $header.add($detail);

            // open detail
            closeAllDetails();
            $detail.removeClass('hidden');

            // seed priority: header seed -> detail stored seed -> empty
            const seed = $header.data('detailSeed') || $detail.data('items') || [];

            renderItemsTable($group, seed);

            // enable edit (if you want it enabled after reopen)
            setRowEditing($group, true);
            updateRowButtons($group, $header);
        }

        function applySearchAndFilters(opts = {}) {
            const keepOpenId = opts.keepOpenId;
            const inPlace = !!opts.inPlace;

            const q = ($('#metalSearch').val() || '').toLowerCase().trim();
            const metal = ($('#filterMetalType').val() || '').toLowerCase().trim();
            const soldFilter = ($('#filterSold').val() || '').toLowerCase().trim(); // '', 'sold', 'not_sold'
            const ben = ($('#filterBeneficiary').val() || '').toLowerCase().trim();

            // auto switch summary view based on Sold filter
            if (soldFilter === 'sold' && ACTIVE_INV_VIEW !== 'sold') {
                setInvView('sold');
                setTimeout(syncInvWrapHeight, 0);
            }
            if (soldFilter === 'not_sold' && ACTIVE_INV_VIEW !== 'stock') {
                setInvView('stock');
                setTimeout(syncInvWrapHeight, 0);
            }

            if (!inPlace) closeAllDetails();

            $tbody.find('tr.pm-header[data-id]').each(function () {
                const $header = $(this);
                const id = $header.data('id');
                const $detail = $tbody.find(`tr.pm-detail[data-detail-for="${id}"]`);

                const hay = ($header.attr('data-search') || '').toLowerCase();

                const passQuery = !q || hay.includes(q);
                const passMetal = !metal || hay.includes(` ${metal}`) || hay.includes(metal);
                const passBen = !ben || hay.includes(ben);

                // sold count is computed HERE (where $header exists)
                const rowSoldCount = parseInt(($header.find('[data-sold-count]').text() || '0'), 10) || 0;

                const passSold =
                    !soldFilter ||
                    (soldFilter === 'sold' && rowSoldCount > 0) ||
                    (soldFilter === 'not_sold' && rowSoldCount === 0);

                const show = passQuery && passMetal && passBen && passSold;

                $header.toggleClass('hidden', !show);

                if (!inPlace) {
                    $detail.toggleClass('hidden', true);
                } else {
                    const shouldBeOpen =
                        (keepOpenId && String(id) === String(keepOpenId)) ||
                        !$detail.hasClass('hidden');

                    $detail.toggleClass('hidden', !(show && shouldBeOpen));
                }
            });

            $tbody.find('tr[data-empty-filter]').remove();

            const anyVisible = $tbody.find('tr.pm-header:not(.hidden)').length > 0;
            const hasSaved = $tbody.find('tr.pm-header[data-id]').length > 0;

            // fix: mode removed, use soldFilter
            const isFiltering = !!q || !!metal || !!soldFilter || !!ben;

            if (isFiltering && !anyVisible && hasSaved) {
                $tbody.append(`
                <tr data-empty-filter="1">
                    <td colspan="9" class="p-6 text-center text-slate-500">No matching results.</td>
                </tr>
                `);
            }

            reindexVisible();

            const $visibleHeaders = getVisibleHeaders();
            updateTotalsFromDOM($visibleHeaders);
            buildSummaryFromDOM($visibleHeaders);

            if (keepOpenId) {
                const $newHeader = $tbody.find(`tr.pm-header[data-id="${keepOpenId}"]`).first();
                const $newDetail = $tbody.find(`tr.pm-detail[data-detail-for="${keepOpenId}"]`).first();

                if ($newHeader.length && $newDetail.length && !$newHeader.hasClass('hidden')) {
                    if (!inPlace) openDetailForHeader($newHeader);
                    else $newDetail.removeClass('hidden');
                }
            }
        }

        // Reindex visible HEADER rows (saved + draft)
        function reindexVisible() {
            let sn = 1;
            let visIndex = 0;

            $tbody.find('tr.pm-header').each(function () {
                const $h = $(this);
                if ($h.hasClass('hidden')) return;

                $h.find('.snCell').text(sn++);

                visIndex++;
                $h.removeClass('pm-zebra-odd pm-zebra-even')
                    .addClass(visIndex % 2 === 0 ? 'pm-zebra-even' : 'pm-zebra-odd');
            });
        }

        // Events
        $('#metalSearch').on('input', applySearchAndFilters);
        $('#filterMetalType, #filterBeneficiary, #filterSold').on('change', applySearchAndFilters);

        $('#clearFilters').on('click', function () {
            $('#metalSearch').val('');
            $('#filterMetalType').val('');
            $('#filterSold').val('');
            $('#filterBeneficiary').val('');

            // add these:
            $('[data-dd="metal"] .dd-label').text('All Metals');
            $('[data-dd="sold"] .dd-label').text('All');
            $('[data-dd="beneficiary"] .dd-label').text('All Beneficiaries');
            $('[data-dd] .dd-opt').removeClass('bg-indigo-50 text-indigo-700 font-semibold');
            $('[data-dd="metal"] .dd-opt[data-value=""]').addClass('bg-indigo-50 text-indigo-700 font-semibold');
            $('[data-dd="sold"] .dd-opt').removeClass('bg-indigo-50 text-indigo-700 font-semibold');
            $('[data-dd="sold"] .dd-opt[data-value=""]').addClass('bg-indigo-50 text-indigo-700 font-semibold');
            $('[data-dd="beneficiary"] .dd-opt').removeClass('bg-indigo-50 text-indigo-700 font-semibold');
            $('[data-dd="beneficiary"] .dd-opt[data-value=""]').addClass('bg-indigo-50 text-indigo-700 font-semibold');

            applySearchAndFilters();
        });

        // Run once
        applySearchAndFilters();
        updateTotalsFromDOM();
        buildSummaryFromDOM();

        function isDirty($group, orig) {
            const now = rowSnapshot($group);
            return Object.keys(now).some(k => (now[k] ?? '') !== (orig[k] ?? ''));
        }

        function setRowEditing($group, on) {
            $group.find('.gts-editable').prop('disabled', !on);

            // refresh custom dropdowns (disabled/enabled UI)
            $group.find('select').trigger('pm:refresh');

            const $header = $group.filter('tr.pm-header');

            if (on) {
                $header.removeClass('view-mode').addClass('editing');
                $header.find('[data-action="cancel"]').removeClass('hidden');
                // save handled by updateRowButtons
            } else {
                $header.removeClass('editing').addClass('view-mode');
                $header.find('[data-action="save"]').addClass('hidden');
                $header.find('[data-action="cancel"]').addClass('hidden');
            }
        }

        (function initFilterDropdownsV2() {
            let $openWrap = null;

            function closeWrap($wrap) {
                if (!$wrap || !$wrap.length) return;
                const $panel = $wrap.data('portedPanel') || $wrap.find('.dd-panel');
                $panel.addClass('hidden');
                $openWrap = null;

                const onMove = $panel.data('onMove');
                if (onMove) {
                    $(window).off('scroll.ddFilter resize.ddFilter', onMove);
                    $('.pm-table-scroll').off('scroll.ddFilter', onMove);
                }
                $(document).off('mousedown.ddFilter');
                $(document).off('keydown.ddFilter');
            }

            function placeFilterMenu($btn, $panel) {
                const r = $btn[0].getBoundingClientRect();

                const wasHidden = $panel.hasClass('hidden');
                if (wasHidden) $panel.removeClass('hidden').css({ visibility: 'hidden' });

                // width
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const gap = 6;

                const minW = Number($panel.attr('data-minw') || 220);
                let panelW = Math.max(r.width, minW);
                panelW = Math.min(panelW, vw - 16);

                $panel.css({ width: panelW + 'px' });

                // compute maxHeight + direction
                const spaceBelow = vh - r.bottom - gap;
                const spaceAbove = r.top - gap;

                const preferUp = (vw < 640);
                let openUp = preferUp ? (spaceAbove > 160) : (spaceBelow < 240 && spaceAbove > spaceBelow);

                // set list max height (so panel doesn't go off-screen)
                const $inner = $panel.children().first(); // your panel contains <div class="p-2 ...">
                const maxH = openUp ? Math.max(160, spaceAbove - 12) : Math.max(160, spaceBelow - 12);
                $inner.css({ maxHeight: maxH + 'px', overflow: 'auto' });

                const panelH = $panel.outerHeight();
                let top = openUp ? (r.top - gap - panelH) : (r.bottom + gap);
                top = Math.max(8, Math.min(top, vh - panelH - 8));

                let left = r.left;
                left = Math.max(8, Math.min(left, vw - panelW - 8));

                $panel.css({
                    position: 'fixed',
                    top: top + 'px',
                    left: left + 'px',
                    zIndex: 9999999,
                    visibility: ''
                });

                if (wasHidden) $panel.addClass('hidden');
            }

            function openWrap($wrap) {
                const $btn = $wrap.find('.dd-btn').first();
                let $panel = $wrap.data('portedPanel');

                // first time: portal panel to body
                if (!$panel || !$panel.length) {
                    $panel = $wrap.find('.dd-panel').first();
                    $panel.addClass('dd-panel--ported');
                    $wrap.data('portedPanel', $panel);
                    $('body').append($panel);
                    $panel.data('ownerWrap', $wrap);
                }

                $panel.data('ownerWrap', $wrap);

                // close others
                if ($openWrap && $openWrap.get(0) !== $wrap.get(0)) closeWrap($openWrap);
                $openWrap = $wrap;

                placeFilterMenu($btn, $panel);
                $panel.removeClass('hidden');

                // re-place after layout settles
                requestAnimationFrame(() => requestAnimationFrame(() => placeFilterMenu($btn, $panel)));

                // reposition / close on scroll
                const onMove = () => {
                    const rr = $btn[0].getBoundingClientRect();
                    const out =
                        rr.bottom < 0 || rr.top > window.innerHeight || rr.right < 0 || rr.left > window.innerWidth;
                    if (out) return closeWrap($wrap);
                    placeFilterMenu($btn, $panel);
                };

                $panel.data('onMove', onMove);
                $(window).on('scroll.ddFilter resize.ddFilter', onMove);
                $('.pm-table-scroll').on('scroll.ddFilter', onMove);

                // outside click close
                $(document).off('mousedown.ddFilter').on('mousedown.ddFilter', function (e) {
                    if ($(e.target).closest($panel).length) return;
                    if ($(e.target).closest($btn).length) return;
                    closeWrap($wrap);
                });

                // esc close
                $(document).off('keydown.ddFilter').on('keydown.ddFilter', function (e) {
                    if (e.key === 'Escape') closeWrap($wrap);
                });
            }

            // open/close
            $(document).off('click.ddFilterBtn').on('click.ddFilterBtn', '[data-dd] .dd-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                const $wrap = $(this).closest('[data-dd]');
                const $panel = $wrap.data('portedPanel') || $wrap.find('.dd-panel');
                if ($panel && !$panel.hasClass('hidden') && $openWrap && $openWrap.get(0) === $wrap.get(0)) {
                    closeWrap($wrap);
                    return;
                }
                openWrap($wrap);
            });

            // choose option (WORKS WITH PORTALED PANELS)
            $(document).off('click.ddFilterOpt').on('click.ddFilterOpt', '.dd-panel .dd-opt', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const $opt = $(this);
                const val = $opt.data('value');
                const label = $.trim($opt.text());

                // panel might be portaled to body => get owner wrap from data
                const $panel = $opt.closest('.dd-panel');
                const $wrap = $panel.data('ownerWrap') || $opt.closest('[data-dd]'); // fallback
                if (!$wrap || !$wrap.length) return;

                const $select = $wrap.find('select').first();
                const $label = $wrap.find('.dd-label').first();

                $label.text(label).attr('title', label);
                $select.val(val).trigger('change').trigger('input');
                applySearchAndFilters();

                // highlight inside THIS panel
                $panel.find('.dd-opt').removeClass('bg-indigo-50 text-indigo-700 font-semibold');
                $opt.addClass('bg-indigo-50 text-indigo-700 font-semibold');

                closeWrap($wrap);
            });

            // initial sync highlight (WORKS WITH PORTALED PANELS)
            $('[data-dd]').each(function () {
                const $wrap = $(this);
                const $select = $wrap.find('select').first();
                const current = $select.val() ?? '';

                const $panel = $wrap.data('portedPanel') || $wrap.find('.dd-panel').first();
                if (!$panel.length) return;

                const $match = $panel.find(`.dd-opt[data-value="${current}"]`).first();
                if ($match.length) {
                    $wrap.find('.dd-label').text($.trim($match.text())).attr('title', $.trim($match.text()));
                    $panel.find('.dd-opt').removeClass('bg-indigo-50 text-indigo-700 font-semibold');
                    $match.addClass('bg-indigo-50 text-indigo-700 font-semibold');
                }
            });

        })();

        function updateRowButtons($group, $header) {
            const orig = $header.data('orig') || {};
            const $btnSave = $header.find('[data-action="save"]');
            if (!$btnSave.length) return;

            if (isDirty($group, orig)) $btnSave.removeClass('hidden');
            else $btnSave.addClass('hidden');
        }

        // Delegated change tracker (works inside nested item tables too)
        $tbody.on('input change', '.gts-editable', function () {

            // 1) If user edits a field in the header row itself
            const $headerSelf = $(this).closest('tr.pm-header');
            if ($headerSelf.length) {
                const id = $headerSelf.data('id');
                if (!id) return;

                const $detail = $tbody.find(`tr.pm-detail[data-detail-for="${id}"]`);
                const $group = $headerSelf.add($detail);

                updateRowButtons($group, $headerSelf);
                return;
            }

            // 2) If user edits a field inside the expanded detail (including items table)
            const $detailRow = $(this).closest('tr.pm-detail'); // important
            const id = $detailRow.data('detail-for');
            if (!id) return;

            const $header = $tbody.find(`tr.pm-header[data-id="${id}"]`);
            const $group = $header.add($detailRow);

            // Don’t require "editing" class (your UX is inline editable)
            updateRowButtons($group, $header);
        });

        $tbody.on('input change', 'input[name$="[purchase_price]"]', function () {
            const $detail = $(this).closest('tr.pm-detail');
            const id = $detail.data('detail-for');

            const $header =
                $tbody.find(`tr.pm-header[data-id="${id}"]`).first().length
                    ? $tbody.find(`tr.pm-header[data-id="${id}"]`).first()
                    : $tbody.find(`tr.pm-header[data-tmp="${id}"]`).first(); // draft uses tmp id

            updateHeaderPurchaseTotal($header, $detail);
            updateTotalsFromDOM();
        });

        $tbody.on('input change', 'input[name$="[sell_price]"]', function () {
            updateTotalsFromDOM();
        })

        // ---------- helpers for expand ----------
        function closeAllDetails(exceptId = null) {
            $tbody.find('tr.pm-detail').each(function () {
                const $d = $(this);

                // do not auto-close draft row
                if ($d.attr('data-draft') === '1') return;

                const id = $d.data('detail-for');
                if (exceptId && String(id) === String(exceptId)) return;

                closeDetailRow($d); // use your smooth close (better)
                // or: $d.addClass('hidden');
            });
        }

        // Delegated: works for saved rows + newly added draft rows
        $tbody.off('click.pmHeader').on('click.pmHeader', 'tr.pm-header', function (e) {
            const $header = $(this);

            // 1) Never toggle from actions/buttons
            if ($(e.target).closest('.pm-actions, [data-action], button, a, form, [data-no-toggle]').length) {
                return;
            }

            const isDraft = ($header.attr('data-draft') === '1');
            const id = isDraft ? $header.attr('data-tmp') : $header.data('id');
            if (!id) return;

            const $detail = $tbody.find(`tr.pm-detail[data-detail-for="${id}"]`);
            if (!$detail.length) return;

            const isOpen = !$detail.hasClass('hidden');
            const $group = $header.add($detail);

            // Field clicked? (remember it so we can focus after opening)
            const $clickedField = $(e.target).closest('input[name], select[name], textarea[name]');
            const clickedName = $clickedField.length ? $clickedField.attr('name') : null;

            // If row already open:
            // - clicking inside a field should NOT toggle close
            if (isOpen) {
                if ($clickedField.length || $(e.target).closest('.dd2, .dd2-panel, label').length) {
                    return;
                }

                // click on non-field area => close
                setRowEditing($group, false);
                updateRowButtons($group, $header);
                closeDetailRow($detail);
                return;
            }

            // --- If closed: OPEN always (even if click was inside inputs)

            // close others
            $tbody.find('tr.pm-detail').not($detail).each(function () {
                const $d = $(this);
                if ($d.hasClass('hidden')) return;

                const otherId = $d.data('detail-for');
                const $h = $tbody.find(`tr.pm-header[data-id="${otherId}"]`).first();
                const $g = $h.add($d);

                setRowEditing($g, false);
                closeDetailRow($d);
            });

            // Draft row: open and keep open
            if (isDraft) {
                openDetailRow($detail);
                // enable editing for draft
                setRowEditing($group, true);
                updateRowButtons($group, $header);

                // focus same clicked input in header (if any)
                if (clickedName) {
                    requestAnimationFrame(() => {
                        $header.find(`[name="${CSS.escape(clickedName)}"]`).trigger('focus');
                    });
                }
                return;
            }

            // Saved row open
            openOnlyThisDetail(id);

            const seed = $detail.data('items') || [];
            renderItemsTable($group, seed);

            if (!$header.data('itemsBaselineReady')) {
                $header.data('orig', rowSnapshot($group));
                $header.data('itemsBaselineReady', true);
            }

            setRowEditing($group, true);
            updateRowButtons($group, $header);

            // focus same clicked input in header (if any)
            if (clickedName) {
                requestAnimationFrame(() => {
                    $header.find(`[name="${CSS.escape(clickedName)}"]`).trigger('focus');
                });
            }
        });

        // ---------- Custom Dropdown Builder (for DETAIL selects) ----------
        function buildCustomDropdown($select, opts = {}) {
            // remove any previous custom UI next to this select
            const $existing = $select.next('.dd2');
            if ($existing.length) $existing.remove();

            // remove any old panel stored for this select (if moved to body)
            const oldPanel = $select.data('dd2Panel');
            if (oldPanel && oldPanel.length) {
                closeMenu(oldPanel);
                oldPanel.remove();
            }
            $select.removeData('dd2Panel');

            // remove old namespaced handlers
            $select.off('.dd2');

            const o = Object.assign({
                placeholder: 'Select',
                wrapClass: '',
                btnClass: '',
                panelClass: '',
            }, opts);

            // collect options
            const options = $select.find('option').map(function () {
                return {
                    value: $(this).attr('value') ?? '',
                    label: $(this).text().trim()
                };
            }).get();

            // create wrap FIRST
            const $wrap = $(`
                <div class="dd2 relative ${o.wrapClass}">
                <button type="button"
                    class="dd2-btn w-full h-11 px-4 pr-10 rounded-2xl text-left
                    border border-slate-200 bg-white shadow-sm ring-1 ring-black/5
                    hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-indigo-200 focus:border-indigo-300
                    transition relative ${o.btnClass}">
                    <span class="dd2-label text-sm font-medium text-slate-800">${o.placeholder}</span>
                    <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" clip-rule="evenodd"/>
                    </svg>
                    </span>
                </button>

                <div class="dd2-panel hidden absolute z-50 mt-2 w-full rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/10 overflow-hidden ${o.panelClass}">
                    <div class="p-2 dd2-list max-h-56 overflow-auto"></div>
                </div>
                </div>
            `);

            const $panel = $wrap.find('.dd2-panel');
            $panel.attr('data-minw', '220');
            $select.data('dd2Panel', $panel);

            const $list = $wrap.find('.dd2-list');
            options.forEach(opt => {
                const safeVal = String(opt.value).replace(/"/g, '&quot;');
                $list.append(`
                <div class="dd2-opt px-3 py-2 rounded-xl text-sm hover:bg-slate-50 cursor-pointer"
                    data-value="${safeVal}">
                    ${opt.label || o.placeholder}
                </div>
                `);
            });

            // hide select but keep in DOM
            $select.addClass('hidden').css('display', 'none');
            $select.after($wrap);

            const isDisabled = () => $select.prop('disabled');

            function syncFromSelect() {
                const val = $select.val() ?? '';
                const selectedTxt = $select.find('option:selected').text().trim();

                $wrap.find('.dd2-label').text(selectedTxt || o.placeholder);

                $panel.find('.dd2-opt').removeClass('bg-indigo-50 text-indigo-700 font-semibold');
                $panel.find('.dd2-opt').filter(function () {
                    return String($(this).attr('data-value')) === String(val);
                }).addClass('bg-indigo-50 text-indigo-700 font-semibold');

                $wrap.toggleClass('opacity-60', isDisabled());
                $wrap.find('.dd2-btn')
                    .prop('disabled', isDisabled())
                    .toggleClass('cursor-not-allowed', isDisabled());
            }

            syncFromSelect();

            $wrap.on('click.dd2', '.dd2-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (isDisabled()) return;

                $('.dd2-panel').each(function () { closeMenu($(this)); });

                if ($panel.hasClass('hidden')) openMenu($(this), $panel);
                else closeMenu($panel);
            });

            // bind on panel (works even if panel is moved to body)
            $panel.off('.dd2').on('click.dd2', '.dd2-opt', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (isDisabled()) return;

                const val = $(this).attr('data-value');
                $select.val(val).trigger('change').trigger('input');

                syncFromSelect();
                closeMenu($panel);
            });

            $select.on('change.dd2 pm:refresh.dd2', syncFromSelect);

            return $wrap;
        }

        function buildWeightDropdown($select) {
            // remove any previous custom UI next to this select
            const $existing = $select.next('.dd2');
            if ($existing.length) $existing.remove();

            // remove any old panel stored for this select (if moved to body)
            const oldPanel = $select.data('dd2Panel');
            if (oldPanel && oldPanel.length) {
                closeMenu(oldPanel);
                oldPanel.remove();
            }
            $select.removeData('dd2Panel');

            // remove old namespaced handlers
            $select.off('.dd2w');

            const isDisabled = () => $select.prop('disabled');

            // collect options + optgroups
            const menuItems = [];
            $select.children().each(function () {
                const $el = $(this);

                if ($el.is('optgroup')) {
                    menuItems.push({ type: 'group', label: $el.attr('label') || '' });

                    $el.find('option').each(function () {
                        menuItems.push({
                            type: 'opt',
                            value: $(this).attr('value') ?? '',
                            label: $(this).text().trim()
                        });
                    });

                } else if ($el.is('option')) {
                    menuItems.push({
                        type: 'opt',
                        value: $el.attr('value') ?? '',
                        label: $el.text().trim()
                    });
                }
            });

            // create wrap ONCE
            const $wrap = $(`
                <div class="dd2 relative">
                <button type="button"
                    class="dd2-btn w-full h-11 px-4 pr-10 rounded-2xl text-left
                    border border-slate-200 bg-white shadow-sm ring-1 ring-black/5
                    hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-indigo-200 focus:border-indigo-300
                    transition relative">
                    <span class="dd2-label text-sm font-medium text-slate-800">Select Weight</span>
                    <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" clip-rule="evenodd"/>
                    </svg>
                    </span>
                </button>

                <div class="dd2-panel hidden absolute z-50 mt-2 w-full rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/10 overflow-hidden">
                    <div class="p-2 dd2-list max-h-60 overflow-auto"></div>
                </div>
                </div>
            `);

            const $panel = $wrap.find('.dd2-panel');
            $panel.attr('data-minw', '280');
            $select.data('dd2Panel', $panel);

            const $list = $wrap.find('.dd2-list');

            // build list
            menuItems.forEach(it => {
                if (it.type === 'group') {
                    $list.append(`<div class="px-3 pt-2 pb-1 text-[11px] font-semibold text-slate-500 uppercase">${it.label}</div>`);
                } else {
                    const safeVal = String(it.value).replace(/"/g, '&quot;');
                    $list.append(`
                        <div class="dd2-opt px-3 py-2 rounded-xl text-sm hover:bg-slate-50 cursor-pointer"
                        data-value="${safeVal}">
                        ${it.label || 'Select Weight'}
                        </div>
                    `);
                }
            });

            // hide select but keep in DOM
            $select.addClass('hidden').css('display', 'none');
            $select.after($wrap);

            function syncFromSelect() {
                const val = $select.val() ?? '';
                const txt = $select.find('option:selected').text().trim();
                $wrap.find('.dd2-label').text(txt || 'Select Weight');

                $panel.find('.dd2-opt').removeClass('bg-indigo-50 text-indigo-700 font-semibold');
                $panel.find('.dd2-opt').filter(function () {
                    return String($(this).attr('data-value')) === String(val);
                }).addClass('bg-indigo-50 text-indigo-700 font-semibold');

                $wrap.toggleClass('opacity-60', isDisabled());
                $wrap.find('.dd2-btn')
                    .prop('disabled', isDisabled())
                    .toggleClass('cursor-not-allowed', isDisabled());
            }

            syncFromSelect();

            $wrap.on('click.dd2w', '.dd2-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (isDisabled()) return;

                $('.dd2-panel').each(function () { closeMenu($(this)); });

                if ($panel.hasClass('hidden')) openMenu($(this), $panel);
                else closeMenu($panel);
            });

            $panel.off('.dd2w').on('click.dd2w', '.dd2-opt', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (isDisabled()) return;

                const v = $(this).attr('data-value');
                $select.val(v).trigger('change').trigger('input');

                syncFromSelect();
                closeMenu($panel);
            });

            $select.on('change.dd2w pm:refresh.dd2w', syncFromSelect);

            return $wrap;
        }

        // 1) Prevent dd2 clicks from bubbling to row/document handlers
        $(document).on('mousedown click', '.dd2, .dd2-panel, .dd2-btn, .dd2-opt', function (e) {
            e.stopPropagation();
        });

        function collectFormDataFromGroup($group, opts = {}) {
            const fd = new FormData();

            $group.find('[name]').each(function () {
                const $el = $(this);

                // skip helper custom input (we will read it when weight select = custom)
                if ($el.hasClass('pm-weight-custom')) return;

                const name = this.name;
                if (!name) return;

                // files
                if (this.type === 'file') {
                    const files = this.files || [];
                    for (let i = 0; i < files.length; i++) fd.append(name, files[i]);
                    return;
                }

                let val = $el.val() ?? '';

                // currency fields: unformat
                if (name.endsWith('[purchase_price]') || name.endsWith('[sell_price]') || name === 'purchase_price' || name === 'sell_price') {
                    val = unformat(val);
                }

                // FIX: Weight select -> if "custom", send the custom number instead of "custom"
                // your weight select in items rows is: items[i][weight]
                if (name.endsWith('[weight]') && $el.hasClass('pm-weight-select')) {
                    if (String(val) === 'custom') {
                        val = ($el.closest('tr').find('.pm-weight-custom').val() || '').trim();
                    }
                    // optional: keep only numeric/decimal (prevents "2qz" mistakes)
                    val = String(val).trim();
                }

                fd.append(name, val);
            });

            if (opts.method) fd.append('_method', opts.method);
            return fd;
        }

        // ---------- init saved rows (HEADER only) ----------
        $tbody.find('tr.pm-header[data-id]').each(function () {
            const $header = $(this);
            const id = $header.data('id');

            // linked detail row
            const $detail = $tbody.find(`tr.pm-detail[data-detail-for="${id}"]`);

            // group = header + detail (so edit/save captures both)
            const $group = $header.add($detail);

            // store original snapshot for full group
            $header.data('orig', rowSnapshot($group));

            // cancel
            $header.find('[data-action="cancel"]').on('click', function (e) {
                e.preventDefault();
                const orig = $header.data('orig') || {};

                $group.find('.gts-editable[name]').each(function () {
                    if (Object.prototype.hasOwnProperty.call(orig, this.name)) {
                        $(this).val(orig[this.name]);
                    }
                });

                updateRowButtons($group, $header);
                setRowEditing($group, false);
                closeAllDetails();
            });

            // save
            $header.find('[data-action="save"]').on('click', function (e) {
                e.preventDefault();

                const $saveBtn = $(this);
                if ($saveBtn.prop('disabled')) return;

                setBtnLoading($saveBtn, true);

                const fd = collectFormDataFromGroup($group, { method: 'PUT' });

                for (const [k, v] of fd.entries()) {
                    console.log('FD:', k, v);
                }

                const token = $('meta[name="csrf-token"]').attr('content');

                $.ajax({
                    url: urlTmpl(METALS.updateUrlTmpl, id),
                    method: 'POST',
                    data: fd,
                    processData: false,
                    contentType: false,
                    headers: {
                        'X-CSRF-TOKEN': token,
                        'Accept': 'application/json'
                    }
                })
                    .done(function () {
                        setBtnLoading($saveBtn, false);

                        // capture latest items + detail fields
                        const seed = persistDetailSeedFromDOM($detail);

                        // keep both jQuery cache + HTML attr updated (so summary works even when row closes)
                        $detail.data('items', seed);
                        $detail.attr('data-items', JSON.stringify(seed));

                        updateHeaderPurchaseTotal($header, $detail);

                        $header.data('detailSeed', seed);

                        $header.data('orig', rowSnapshot($group));
                        rebuildSearchAttr($header, $detail);

                        updateRowButtons($group, $header);
                        setRowEditing($group, false);

                        updateTotalsFromDOM();
                        buildSummaryFromDOM();

                        // keep this row open after filtering/render
                        const keepOpenId = id;
                        applySearchAndFilters({ keepOpenId, inPlace: true });

                        showSuccess('Changes saved.');
                    })
                    .fail(function (xhr) {
                        setBtnLoading($saveBtn, false);
                        console.error(xhr.responseText || xhr);

                        if (xhr.status === 422 && xhr.responseJSON?.errors) {
                            const firstKey = Object.keys(xhr.responseJSON.errors)[0];
                            const msg = xhr.responseJSON.errors[firstKey]?.[0] || 'Validation error';
                            showError(msg, 'Validation');
                            return;
                        }

                        showError('Failed to save changes. Please try again.');
                    });
            });
        });

        // ---------- draft row submit (HEADER + DETAIL) ----------
        function submitNewRow(btn) {
            if (draftSubmitting) return;          // avoid double click
            draftSubmitting = true;

            const $btn = $(btn);
            setBtnLoading($btn, true);

            const $header = $(btn).closest('tr');                 // header row
            const tmpId = $header.attr('data-tmp');               // our tmp group id
            const $detail = $tbody.find(`tr.pm-detail[data-detail-for="${tmpId}"]`);

            const $group = $header.add($detail);

            const fd = collectFormDataFromGroup($group);

            for (const [k, v] of fd.entries()) {
                console.log('FD:', k, v);
            }

            const invoice = ($group.find('[name="invoice_no"]').val() || '').trim();
            const pdate = ($group.find('[name="purchase_date"]').val() || '').trim();

            if (!invoice || !pdate) {
                setBtnLoading($btn, false);
                draftSubmitting = false;
                showError('Please fill Invoice No and Purchase Date.');
                return;
            }

            const token = $('meta[name="csrf-token"]').attr('content');

            $.ajax({
                url: METALS.storeUrl,
                method: 'POST',
                data: fd,
                processData: false,
                contentType: false,
                headers: {
                    'X-CSRF-TOKEN': token,
                    'Accept': 'application/json'
                }
            })
                .done(function () {
                    setBtnLoading($btn, false);
                    draftSubmitting = false;
                    location.reload();
                })
                .fail(function (xhr) {
                    setBtnLoading($btn, false);
                    draftSubmitting = false;

                    console.error("STORE ERROR:", xhr.status, xhr.responseText);

                    // show first validation msg if Laravel returns 422
                    if (xhr.status === 422 && xhr.responseJSON?.errors) {
                        const firstKey = Object.keys(xhr.responseJSON.errors)[0];
                        const msg = xhr.responseJSON.errors[firstKey]?.[0] || 'Validation error';
                        showError(msg, 'Validation');
                        return;
                    }

                    showError('Failed to save. Please check required fields and try again.');
                });
        };

        function cancelNewRow(btn) {
            const $header = $(btn).closest('tr');
            const tmpId = $header.attr('data-tmp');
            const $detail = $tbody.find(`tr.pm-detail[data-detail-for="${tmpId}"]`);

            $detail.remove();
            $header.remove();

            reindexVisible(); // better than reindex() because detail rows should not count
            updateTotalsFromDOM();
        };

        // Delete confirm (delegated)
        $(document).on('submit', '.delForm', function (e) {
            e.preventDefault();
            const form = this;

            confirmModal('Delete this entry?', function () {
                form.submit();
            }, 'Delete Entry');
        });

        let activeId = null;
        let selectedFiles = [];

        function urlTmpl(t, id) { return (t || '').replace('__ID__', id); }

        function openModal($m) { $m.removeClass('hidden'); $('body').addClass('pm-modal-open'); }
        function closeModal($m) { $m.addClass('hidden'); $('body').removeClass('pm-modal-open'); }

        function jsonGet(url) {
            return $.ajax({ url, method: 'GET', headers: { 'Accept': 'application/json' } });
        }

        function loadExistingIntoUploadModal(id) {
            $('#attExistingList').html('<div class="text-white/50 text-sm">Loading...</div>');
            return jsonGet(urlTmpl(METALS.attachmentsIndex, id)).done(res => {
                const files = res.files || [];
                if (!files.length) {
                    $('#attExistingList').html('<div class="text-white/40 text-sm">No attachments yet.</div>');
                    return;
                }
                $('#attExistingList').html(files.map(f => `
                    <div class="pm-file-pill flex items-center justify-between px-3 py-2">
                        <div class="text-sm truncate text-slate-700">${escapeHtml(f.name)}</div>
                        <button type="button" class="pm-danger-mini"
                        data-del-path="${escapeHtml(f.path)}" title="Remove">
                        <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                `).join(''));
            });
        }

        function loadViewer(id) {
            $('#attViewerList').html('<div class="text-white/50 text-sm">Loading...</div>');
            $('#attPreviewFrame, #attPreviewImg').addClass('hidden');
            $('#attPreviewEmpty').removeClass('hidden');
            $('#attDownloadBtn').attr('href', '#');

            // Download all
            $('#attDownloadAllBtn').attr('href', urlTmpl(METALS.attachmentsDownloadAll, id));

            return jsonGet(urlTmpl(METALS.attachmentsIndex, id)).done(res => {
                const files = res.files || [];
                if (!files.length) {
                    $('#attViewerList').html('<div class="text-white/40 text-sm">No attachments found.</div>');
                    return;
                }

                $('#attViewerList').html(files.map((f) => `
                    <button type="button"
                        class="att-item w-full text-left px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                        data-file='${escapeHtml(JSON.stringify(f))}'>
                        <div class="att-name text-sm truncate">${escapeHtml(f.name)}</div>
                        <div class="att-meta text-[11px] text-slate-500">${(f.type || '').toUpperCase()}</div>
                    </button>
                `).join(''));

                // auto select first
                $('#attViewerList .att-item').first().trigger('click');
            });
        }

        function loadExistingSellIntoUploadModal(id, idx) {
            $('#attExistingList').html('<div class="text-white/50 text-sm">Loading...</div>');

            return jsonGet(`/metals/${id}/items/${idx}/sell-attachments`).done(res => {
                const files = res.files || [];
                if (!files.length) {
                    $('#attExistingList').html('<div class="text-white/40 text-sm">No sell attachments yet.</div>');
                    return;
                }

                $('#attExistingList').html(files.map(f => `
                <div class="pm-file-pill flex items-center justify-between px-3 py-2">
                    <div class="text-sm truncate text-slate-700">${escapeHtml(f.name)}</div>
                    <button type="button" class="pm-danger-mini"
                    data-sell-del-path="${escapeHtml(f.path)}" title="Remove">
                    <i class="bi bi-x-lg"></i>
                    </button>
                </div>
                `).join(''));
            });
        }

        function loadSellViewer(id, idx) {
            $('#attViewerList').html('<div class="text-white/50 text-sm">Loading...</div>');
            $('#attPreviewFrame, #attPreviewImg').addClass('hidden');
            $('#attPreviewEmpty').removeClass('hidden');
            $('#attDownloadBtn').attr('href', '#');

            // Download all (sell)
            $('#attDownloadAllBtn').attr('href', `/metals/${id}/items/${idx}/sell-attachments/download-all`);

            return jsonGet(`/metals/${id}/items/${idx}/sell-attachments`).done(res => {
                const files = res.files || [];
                if (!files.length) {
                    $('#attViewerList').html('<div class="text-white/40 text-sm">No sell attachments found.</div>');
                    return;
                }

                $('#attViewerList').html(files.map((f) => `
                <button type="button"
                    class="att-item w-full text-left px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                    data-file='${escapeHtml(JSON.stringify(f))}'>
                    <div class="att-name text-sm truncate">${escapeHtml(f.name)}</div>
                    <div class="att-meta text-[11px] text-slate-500">${(f.type || '').toUpperCase()}</div>
                </button>
                `).join(''));

                $('#attViewerList .att-item').first().trigger('click');
            });
        }

        function setSelectedLabel() {
            if (!selectedFiles.length) $('#attSelectedLabel').text('No files selected yet.');
            else $('#attSelectedLabel').text(`${selectedFiles.length} file(s) selected.`);
        }

        function pickFiles(files) {
            selectedFiles = Array.from(files || []);
            setSelectedLabel();
        }

        // Draft buttons (delegated)
        $(document).on('click', '[data-action="submit-draft"]', function (e) {
            e.preventDefault();
            e.stopPropagation();
            submitNewRow(this);
        });

        $(document).on('click', '[data-action="cancel-draft"]', function (e) {
            e.preventDefault();
            e.stopPropagation();
            cancelNewRow(this);
        });

        // Open Upload modal
        $(document).on('click', '[data-action="upload-attachments"]', function (e) {
            e.preventDefault();
            e.stopPropagation();

            ATT_MODE = 'entry';
            activeId = $(this).data('id');

            selectedFiles = [];
            setSelectedLabel();
            $('#attUploadInput').val('');

            openModal($('#attUploadModal'));
            loadExistingIntoUploadModal(activeId);
        });

        // Upload modal close
        $('#attUploadClose, #attUploadCancel').on('click', function () {
            closeModal($('#attUploadModal'));
        });

        // Dropzone browse
        $('#attBrowseBtn').off('click.attBrowse').on('click.attBrowse', function () {
            $('#attUploadInput').trigger('click');
        });

        $('#attUploadInput').off('change.attUpload').on('change.attUpload', function () {
            pickFiles(this.files);
        });

        $('#attDropZone')
            .on('dragover', function (e) {
                e.preventDefault();
                e.stopPropagation();
                $(this).addClass('is-over'); // new clean UI class
            })
            .on('dragleave', function (e) {
                e.preventDefault();
                e.stopPropagation();
                $(this).removeClass('is-over');
            })
            .on('drop', function (e) {
                e.preventDefault();
                e.stopPropagation();
                $(this).removeClass('is-over');

                const files = e.originalEvent.dataTransfer.files;
                pickFiles(files);
            });

        // Delete existing file inside Upload modal
        $(document).on('click', '#attExistingList [data-del-path]', function () {
            const path = $(this).data('del-path');
            if (!activeId) return;
            confirmModal('Remove this attachment?', function () {
                $.ajax({
                    url: urlTmpl(METALS.attachmentsDestroy, activeId),
                    method: 'POST',
                    data: { _method: 'DELETE', path },
                    headers: { 'X-CSRF-TOKEN': METALS.csrf, 'Accept': 'application/json' }
                })
                    .done(() => {
                        loadExistingIntoUploadModal(activeId);
                        showSuccess('Attachment removed.');
                    })
                    .fail(() => showError('Failed to remove attachment.'));
            }, 'Remove Attachment');
        });

        // Upload files
        $('#attUploadBtn').off('click.attUpload').on('click.attUpload', function () {
            const $btn = $(this);
            if ($btn.data('busy')) return; // prevent double click

            if (!selectedFiles.length) { showInfo('Please select files first.'); return; }

            // decide URL by mode (IMPORTANT: don't require activeId for sell)
            let url = '';
            if (ATT_MODE === 'sell') {
                if (!activeSellId || activeSellIdx === null) {
                    showError('Sell upload target missing. Please reopen Sell Upload.');
                    return;
                }
                url = `/metals/${activeSellId}/items/${activeSellIdx}/sell-attachments`;
            } else {
                if (!activeId) {
                    showError('Entry upload target missing. Please reopen Upload.');
                    return;
                }
                url = urlTmpl(METALS.attachmentsStore, activeId);
            }

            const fd = new FormData();
            selectedFiles.forEach(f => fd.append('attachments[]', f));

            setBtnBusy($btn, true, 'Uploading...');

            $.ajax({
                url,
                method: 'POST',
                data: fd,
                processData: false,
                contentType: false,
                headers: { 'X-CSRF-TOKEN': METALS.csrf, 'Accept': 'application/json' }
            })
                .done(() => {
                    selectedFiles = [];
                    setSelectedLabel();
                    $('#attUploadInput').val('');

                    if (ATT_MODE === 'sell') loadExistingSellIntoUploadModal(activeSellId, activeSellIdx);
                    else loadExistingIntoUploadModal(activeId);

                    showSuccess('Uploaded successfully.');
                })
                .fail((xhr) => {
                    console.error(xhr.responseText || xhr);
                    showError('Upload failed. Check file type/size.');
                })
                .always(() => {
                    setBtnBusy($btn, false);
                });
        });

        // Open Viewer modal
        $(document).on('click', '[data-action="view-attachments"]', function (e) {
            e.preventDefault();
            e.stopPropagation();
            activeId = $(this).data('id');

            openModal($('#attViewerModal'));
            loadViewer(activeId);
        });

        // Viewer close
        $('#attViewerClose').on('click', function () {
            closeModal($('#attViewerModal'));
        });

        // Click a file in viewer list
        $(document).on('click', '#attViewerList button', function () {

            // highlight active item
            $('#attViewerList .att-item').removeClass('active');

            // add active to clicked
            $(this).addClass('active');

            const raw = $(this).attr('data-file');
            if (!raw) return;

            const f = JSON.parse(raw);

            // download single
            const durl =
                urlTmpl(METALS.attachmentsDownload, activeId) +
                '?path=' + encodeURIComponent(f.path);

            $('#attDownloadBtn').attr('href', durl);

            // preview
            $('#attPreviewEmpty').addClass('hidden');

            if (f.type === 'pdf') {
                $('#attPreviewImgWrap').addClass('hidden');
                $('#attPreviewImg').addClass('hidden').attr('src', '');

                $('#attPreviewFrame')
                    .removeClass('hidden')
                    .attr('src', f.url);

            } else {
                $('#attPreviewFrame').addClass('hidden').attr('src', '');
                $('#attPreviewEmpty').addClass('hidden');

                $('#attPreviewImgWrap').removeClass('hidden');
                const $img = $('#attPreviewImg');

                $img.removeClass('hidden');

                // set src
                $img.attr('src', f.url);

                // if browser cached it, force trigger load handler
                const imgEl = $img.get(0);
                if (imgEl && imgEl.complete) {
                    setTimeout(() => $img.trigger('load'), 0);
                }
            }
        });

        (function () {
            const $box = $('#attPreviewBox');
            const $wrap = $('#attPreviewImgWrap');
            const $img = $('#attPreviewImg');

            let scale = 1;
            const MIN = 0.5, MAX = 6, STEP = 0.25;

            let natW = 0, natH = 0;

            // pan state
            let isDown = false;
            let startX = 0, startY = 0;
            let scrollLeft = 0, scrollTop = 0;

            function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

            function centerScroll() {
                const boxEl = $box.get(0);
                if (!boxEl) return;
                boxEl.scrollLeft = (boxEl.scrollWidth - boxEl.clientWidth) / 2;
                boxEl.scrollTop = (boxEl.scrollHeight - boxEl.clientHeight) / 2;
            }

            function applyScale() {
                if (!natW || !natH) return;

                const w = Math.max(1, Math.round(natW * scale));
                const h = Math.max(1, Math.round(natH * scale));

                // resize wrapper (scroll area comes from this)
                $wrap.css({ width: w + 'px', height: h + 'px' });
            }

            function resetZoom() {
                scale = 1;
                applyScale();
                centerScroll();
            }

            function fitZoom() {
                if (!natW || !natH) return;

                const boxEl = $box.get(0);
                if (!boxEl) return;

                // small padding so it never clips by 1px borders
                const pad = 8;
                const bw = Math.max(1, boxEl.clientWidth - pad);
                const bh = Math.max(1, boxEl.clientHeight - pad);

                const s = Math.min(bw / natW, bh / natH);
                scale = clamp(s, MIN, MAX);

                applyScale();
                centerScroll();
            }

            // Expose for your existing calls
            window.attViewerResetZoom = resetZoom;
            window.attViewerFitZoom = fitZoom;

            // Buttons
            $(document).on('click', '#attZoomIn', function () {
                if ($img.hasClass('hidden')) return;
                scale = clamp(scale + STEP, MIN, MAX);
                applyScale();
                centerScroll();
            });

            $(document).on('click', '#attZoomOut', function () {
                if ($img.hasClass('hidden')) return;
                scale = clamp(scale - STEP, MIN, MAX);
                applyScale();
                centerScroll();
            });

            $(document).on('click', '#attZoomReset', function () {
                if ($img.hasClass('hidden')) return;
                resetZoom();
            });

            $(document).on('click', '#attZoomFit', function () {
                if ($img.hasClass('hidden')) return;
                fitZoom();
            });

            // Wheel zoom
            $box.on('wheel', function (e) {
                if ($img.hasClass('hidden')) return;
                e.preventDefault();

                const delta = e.originalEvent.deltaY;
                scale = clamp(scale + (delta < 0 ? STEP : -STEP), MIN, MAX);
                applyScale();
                centerScroll();
            });

            // Drag to pan (scroll container)
            $box.on('mousedown', function (e) {
                if ($img.hasClass('hidden')) return;
                isDown = true;
                $img.addClass('is-panning');

                const el = $box.get(0);
                startX = e.pageX;
                startY = e.pageY;
                scrollLeft = el.scrollLeft;
                scrollTop = el.scrollTop;
            });

            $(document).on('mouseup', function () {
                isDown = false;
                $img.removeClass('is-panning');
            });

            $box.on('mousemove', function (e) {
                if (!isDown || $img.hasClass('hidden')) return;
                const el = $box.get(0);
                const dx = e.pageX - startX;
                const dy = e.pageY - startY;
                el.scrollLeft = scrollLeft - dx;
                el.scrollTop = scrollTop - dy;
            });

            // whenever a new image loads, capture natural size and fit
            $img.off('load.attZoomFix').on('load.attZoomFix', function () {
                natW = this.naturalWidth || 0;
                natH = this.naturalHeight || 0;

                // show wrapper properly
                $wrap.removeClass('hidden');
                fitZoom();
            });

        })();

        $(document).on('click', '[data-metal-tab]', function () {
            ACTIVE_METAL = String($(this).attr('data-metal-tab') || '').toLowerCase();
            buildSummaryFromDOM();
            setTimeout(syncInvWrapHeight, 0);
        });

        $(document).on('click', '.pmShapeTab', function () {
            ACTIVE_SHAPE = String($(this).attr('data-shape') || 'All');
            if (ACTIVE_SHAPE !== 'All') ACTIVE_SHAPE = ACTIVE_SHAPE.toLowerCase();
            buildSummaryFromDOM();
            setTimeout(syncInvWrapHeight, 0);
        });

        $tbody.on('input change', 'input[name="qty"]', function () {
            const $header = $(this).closest('tr'); // draft or saved header

            // must have either data-id (saved) or data-tmp (draft)
            const id = String($header.data('id') || $header.attr('data-tmp') || '');
            if (!id) return;

            const $detail = $tbody.find(`tr.pm-detail[data-detail-for="${id}"]`);
            if (!$detail.length) return;

            // preserve current entered values
            const seed = readItemsFromDOM($detail);

            renderItemsTable($header.add($detail), seed);

            // if it’s draft, keep it open so user sees rows increasing
            if ($header.attr('data-draft') === '1') openDetailRow($detail);
        });

        $(document).on('click', '[data-action="copy-item-1-all"]', function (e) {
            e.preventDefault();
            e.stopPropagation();

            const $detail = $(this).closest('tr.pm-detail');
            const $tb = $detail.find('[data-items-tbody]').first();
            const $row1 = $tb.find('tr[data-item-row="0"]').first();
            if (!$row1.length) return;

            // collect row1 values
            const base = {};
            $row1.find('input[name], select[name], textarea[name]').each(function () {
                base[this.name] = $(this).val() ?? '';
            });

            // grab row1 custom weight input too
            const baseWeightSel = $row1.find('select[name$="[weight]"]').val() ?? '';
            const baseWeightCustom = ($row1.find('.pm-weight-custom').val() ?? '').trim();

            // apply to all other rows
            $tb.find('tr[data-item-row]').each(function () {
                const idx = Number($(this).attr('data-item-row'));
                if (idx === 0) return;

                const $tr = $(this);

                // normal fields copy ( this will copy pcs also automatically)
                $tr.find('input[name], select[name], textarea[name]').each(function () {
                    const field = String(this.name).replace(/^items\[\d+\]\[/, 'items[0][');
                    if (base[field] !== undefined) {
                        $(this).val(base[field]).trigger('change').trigger('input');
                    }
                });

                // special handling for weight custom value
                const $wSel = $tr.find('select[name$="[weight]"]');
                const $wCustom = $tr.find('.pm-weight-custom');

                if ($wSel.length) {
                    if (String(baseWeightSel) === 'custom') {
                        $wSel.val('custom').trigger('change').trigger('input');
                        $wCustom.removeClass('hidden').val(baseWeightCustom).trigger('input');
                    } else {
                        $wSel.val(baseWeightSel).trigger('change').trigger('input');
                        $wCustom.addClass('hidden').val('');
                    }
                }

                // (so coin switches certificate -> pcs correctly)
                toggleCoinFields($tr);
            });
        });

        $(document).on('change', 'select.pm-weight-select', function () {
            const $sel = $(this);
            const idx = $sel.data('idx');
            const $wrap = $sel.closest('.pm-weight-wrap');
            const $custom = $wrap.find('.pm-weight-custom');

            if ($sel.val() === 'custom') {
                $custom.removeClass('hidden').focus();
            } else {
                $custom.addClass('hidden').val('');
            }
        });

        function toggleShowSummaryBtn($detail) {
            $detail.find('tr[data-item-row]').each(function () {
                const $row = $(this);
                const sellP = ($row.find('input[name$="[sell_price]"]').val() || '').trim();
                const sellD = ($row.find('input[name$="[sell_date]"]').val() || '').trim();

                const show = (num(sellP) > 0) || !!sellD;
                $row.find('.pm-show-summary-btn').toggleClass('hidden', !show);
            });
        }

        function toggleSellButtons($detail) {
            $detail.find('tr[data-item-row]').each(function () {
                const $r = $(this);
                const sellP = ($r.find('input[name$="[sell_price]"]').val() || '').trim();
                const sellD = ($r.find('input[name$="[sell_date]"]').val() || '').trim();
                const hasSell = (num(sellP) > 0) || !!sellD;

                // disable if not sold OR if draft row (no numeric id)
                const entryId = String($detail.data('detail-for') || '');
                const isSaved = /^\d+$/.test(entryId);

                $r.find('[data-action="sell-upload"], [data-action="sell-view"]')
                    .prop('disabled', !(hasSell && isSaved));
            });
        }

        $tbody.on('input change', 'input[name$="[sell_price]"], input[name$="[sell_date]"]', function () {
            const $detail = $(this).closest('tr.pm-detail');
            const $tr = $(this).closest('tr[data-item-row]');
            const $header = getHeaderForDetail($detail);
            updateHeaderSoldCount($header, $detail);

            toggleShowSummaryBtn($detail);
            toggleSellButtons($detail);

            // update sold/red preview state
            if ($tr.length) updateItemPreview($tr);
        });

        $(document).off('click.sellUpload').on('click.sellUpload', '[data-action="sell-upload"]', function (e) {
            e.preventDefault(); e.stopPropagation();

            const $itemRow = $(this).closest('tr[data-item-row]');
            const idx = Number($itemRow.attr('data-item-row')) || 0;

            const $detail = $(this).closest('tr.pm-detail');
            const entryId = String($detail.data('detail-for') || '');
            if (!/^\d+$/.test(entryId)) return; // draft - ignore

            ATT_MODE = 'sell';
            activeSellId = entryId;
            activeSellIdx = idx;

            // reuse your upload modal
            selectedFiles = [];
            setSelectedLabel();
            $('#attUploadInput').val('');

            openModal($('#attUploadModal'));
            loadExistingSellIntoUploadModal(activeSellId, activeSellIdx);
        });

        $(document).off('click.sellView').on('click.sellView', '[data-action="sell-view"]', function (e) {
            e.preventDefault(); e.stopPropagation();

            const $itemRow = $(this).closest('tr[data-item-row]');
            const idx = Number($itemRow.attr('data-item-row')) || 0;

            const $detail = $(this).closest('tr.pm-detail');
            const entryId = String($detail.data('detail-for') || '');
            if (!/^\d+$/.test(entryId)) return;

            activeSellId = entryId;
            activeSellIdx = idx;

            openModal($('#attViewerModal'));
            loadSellViewer(activeSellId, activeSellIdx);
        });

        $(document).on('click', '#attExistingList [data-sell-del-path]', function () {
            const path = $(this).data('sell-del-path');
            if (!activeSellId || activeSellIdx === null) return;

            confirmModal('Remove this SELL attachment?', function () {
                $.ajax({
                    url: `/metals/${activeSellId}/items/${activeSellIdx}/sell-attachments`,
                    method: 'POST',
                    data: { _method: 'DELETE', path },
                    headers: { 'X-CSRF-TOKEN': METALS.csrf, 'Accept': 'application/json' }
                })
                    .done(() => {
                        loadExistingSellIntoUploadModal(activeSellId, activeSellIdx);
                        showSuccess('Sell attachment removed.');
                    })
                    .fail(() => showError('Failed to remove sell attachment.'));
            }, 'Remove Attachment');
        });

        $(document).off('click.itemImgUpload').on('click.itemImgUpload', '[data-action="item-img-upload"]', function (e) {
            e.preventDefault(); e.stopPropagation();

            const $row = $(this).closest('tr[data-item-row]');
            const $wrap = $row.find('.pm-item-wrap');

            // block when locked
            if ($wrap.hasClass('is-locked')) return;

            const entryId = getEntryIdFromItemRow($row);
            if (!/^\d+$/.test(entryId)) { showInfo('Save the entry first, then you can upload item photo.'); return; }

            $row.find('[data-preview-file]').trigger('click');
        });

        $(document).off('change.itemImgFile').on('change.itemImgFile', '[data-preview-file]', function () {
            const file = this.files && this.files[0];
            if (!file) return;

            const $row = $(this).closest('tr[data-item-row]');
            const entryId = getEntryIdFromItemRow($row);
            const idx = getItemIdx($row);

            const fd = new FormData();
            fd.append('image', file);

            // tiny loader on preview while uploading
            const $wrap = $row.find('[data-preview]');
            $wrap.addClass('is-uploading');

            $.ajax({
                url: `/metals/${entryId}/items/${idx}/image`,
                method: 'POST',
                data: fd,
                processData: false,
                contentType: false,
                headers: { 'X-CSRF-TOKEN': METALS.csrf, 'Accept': 'application/json' }
            }).done((res) => {
                // store path in hidden field so it persists in your items JSON when you click Save Changes later
                $row.find('input[name$="[image_path]"]').val(res.path || '').trigger('input');

                // set img src to preview url
                $row.find('[data-preview-img]').attr('src', res.url || '');

                $row.find('[data-preview]').addClass('is-custom');

                // show remove button
                $row.find('[data-action="item-img-remove"]').removeClass('hidden');

                showSuccess('Item photo uploaded.');
            }).fail((xhr) => {
                console.error(xhr.responseText || xhr);
                showError('Upload failed. Use JPG/PNG/WEBP up to 5MB.');
            }).always(() => {
                $wrap.removeClass('is-uploading');
                // reset input so selecting same file again triggers change
                $(this).val('');
            });
        });

        $(document).off('click.itemImgRemove').on('click.itemImgRemove', '[data-action="item-img-remove"]', function (e) {
            e.preventDefault(); e.stopPropagation();

            const $row = $(this).closest('tr[data-item-row]');
            if ($row.find('.pm-item-wrap').hasClass('is-locked')) return;

            const entryId = getEntryIdFromItemRow($row);
            const idx = getItemIdx($row);

            confirmModal('Remove this item photo?', function () {
                $.ajax({
                    url: `/metals/${entryId}/items/${idx}/image`,
                    method: 'POST',
                    data: { _method: 'DELETE' },
                    headers: { 'X-CSRF-TOKEN': METALS.csrf, 'Accept': 'application/json' }
                }).done(() => {
                    $row.find('input[name$="[image_path]"]').val('').trigger('input');
                    // fallback to default preview
                    updateItemPreview($row);
                    $row.find('[data-action="item-img-remove"]').addClass('hidden');
                    showSuccess('Item photo removed.');
                }).fail(() => showError('Failed to remove item photo.'));
            }, 'Remove Photo');
        });

        // ---------- Hover Zoom for Uploaded Item Images ----------
        (function initItemImageHoverZoom() {
            const $zoom = $(`
                <div id="pmImgZoom" class="pm-imgzoom hidden" aria-hidden="true">
                <div class="pm-imgzoom-backdrop" data-close="1"></div>
                <img class="pm-imgzoom-img" alt="Preview">
                <button type="button" class="pm-imgzoom-close" data-close="1" title="Close">
                    <i class="bi bi-x-lg"></i>
                </button>
                </div>
            `);

            $('body').append($zoom);

            const $big = $zoom.find('.pm-imgzoom-img');
            let hideTimer = null;

            function openZoom(src) {
                if (!src) return;
                clearTimeout(hideTimer);
                $big.attr('src', src);
                $zoom.removeClass('hidden').attr('aria-hidden', 'false');
            }

            function closeZoom() {
                $zoom.addClass('hidden').attr('aria-hidden', 'true');
                $big.attr('src', '');
            }

            // Hover: only on uploaded images (is-custom)
            $tbody.on('mouseenter', '.pm-preview.is-custom .pm-preview-img', function () {
                if ($(this).closest('.pm-item-wrap').hasClass('is-locked')) return;
                openZoom(this.currentSrc || this.src);
            });

            // Delay hide a bit so moving mouse to center doesn't flicker
            $tbody.on('mouseleave', '.pm-preview.is-custom .pm-preview-img', function () {
                hideTimer = setTimeout(closeZoom, 120);
            });

            // If user moves mouse over overlay, keep it open
            $zoom.on('mouseenter', function () {
                clearTimeout(hideTimer);
            });

            // Leaving overlay closes it
            $zoom.on('mouseleave', function () {
                closeZoom();
            });

            // Click backdrop/close
            $zoom.on('click', '[data-close="1"]', function () {
                closeZoom();
            });

            // Esc closes
            $(document).on('keydown.pmImgZoom', function (e) {
                if (e.key === 'Escape') closeZoom();
            });

            // Mobile/touch: tap image opens (and doesn't toggle row)
            $tbody.on('click', '.pm-preview.is-custom .pm-preview-img', function (e) {
                if ($(this).closest('.pm-item-wrap').hasClass('is-locked')) return;
                e.preventDefault();
                e.stopPropagation();
                openZoom(this.currentSrc || this.src);
            });
        })();

        $(document).on('click', '[data-action="unlock-sold-item"]', function (e) {
            e.preventDefault();
            e.stopPropagation();

            const $itemRow = $(this).closest('tr[data-item-row]');
            const $itemWrap = $itemRow.find('.pm-item-wrap');

            // unlock this item
            $itemWrap.addClass('is-unlocked').removeClass('is-locked');
            $itemWrap.find('[data-closed-badge]').addClass('hidden');
            $(this).addClass('hidden');

            // enable fields + buttons again
            $itemRow.find('.gts-editable').prop('disabled', false);
            $itemWrap.find('[data-action="item-img-upload"], [data-action="item-img-remove"]').prop('disabled', false);
            $itemWrap.find('[data-action="sell-upload"], [data-action="sell-view"]').prop('disabled', false);

            $itemRow.find('select').trigger('pm:refresh');
        });

    });

})(jQuery);