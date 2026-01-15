(function ($) {

    'use strict';

    $(function () {
        let draftSubmitting = false;
        let ACTIVE_METAL = ''; // '' means auto / show only if single metal
        let ACTIVE_SHAPE = 'All';
        let tileIdx = 0;

        if (!window.CSS) window.CSS = {};
        if (!window.CSS.escape) {
            window.CSS.escape = function (s) {
                return String(s).replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
            };
        }

        function unformat(v) {
            return String(v ?? '').replace(/[^\d.-]/g, '');
        }

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

        function openDetailRow($detail) {
            const $anim = $detail.find('.pm-detail-anim').first();
            if (!$anim.length) {
                $detail.removeClass('hidden');
                return;
            }

            // show row first
            $detail.removeClass('hidden');

            // reset closed state
            $anim.removeClass('is-open');
            $anim.css('--pm-detail-max', '0px');

            // next frame: expand to content height
            requestAnimationFrame(() => {
                const h = $anim[0].scrollHeight || 0;
                $anim.css('--pm-detail-max', h + 'px');
                $anim.addClass('is-open');
            });
        }

        function closeDetailRow($detail) {
            const $anim = $detail.find('.pm-detail-anim').first();
            if (!$anim.length) {
                $detail.addClass('hidden');
                return;
            }

            // set current height so it animates down
            const h = $anim[0].scrollHeight || 0;
            $anim.css('--pm-detail-max', h + 'px');

            requestAnimationFrame(() => {
                $anim.removeClass('is-open');
                $anim.css('--pm-detail-max', '0px');
            });

            // hide after transition ends
            $anim.one('transitionend', () => {
                $detail.addClass('hidden');
            });
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

        // Convert a weight value ("100", "31.1035", etc.) into label text ("100 g", "1 oz", ...)
        let $weightProbeSelect = null;
        // Convert weight to label used by Inventory Summary grouping
        function weightLabelFromValue(rawWeight) {
            const raw = String(rawWeight ?? '').trim();
            if (!raw) return 'Unknown';

            const w = normalizeWeightToOptionValue(raw);
            const n = parseFloat(w);

            const near = (a, b, eps = 0.0005) => Math.abs(a - b) <= eps;

            // Force ounce labels for oz weights (prevents "31.1035 g (1 oz)" showing)
            if (Number.isFinite(n)) {
                if (near(n, 31.1035)) return '1 oz';
                if (near(n, 62.207)) return '2 oz';
                if (near(n, 155.5175)) return '5 oz';
                if (near(n, 311.035)) return '10 oz';
            }

            // fallback to your existing select label (grams etc.)
            if (!$weightProbeSelect) {
                $weightProbeSelect = $(itemRowHtml(0)).find('select.pm-weight-select').first();
            }

            const $opt = $weightProbeSelect.find(`option[value="${CSS.escape(String(w))}"]`).first();
            return $opt.length ? $opt.text().trim() : (String(w) + ' g');
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

            // re-position after layout settles (your previous fix)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => placeMenuUnderButton($btn, $menu));
            });

            // close dropdown if button is not in viewport
            const onMove = () => {
                const r = $btn[0].getBoundingClientRect();
                const vh = window.innerHeight;
                const vw = window.innerWidth;

                const outOfView =
                    r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw;

                if (outOfView) {
                    closeMenu($menu);
                    return;
                }

                placeMenuUnderButton($btn, $menu);
            };

            $(window).on('scroll.dd2 resize.dd2', onMove);
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
            if (onMove) $(window).off('scroll.dd2 resize.dd2', onMove);

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

        const $tbody = $('#metalTbody');

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

                    items[idx][key] = val;
                });
            });

            return items;
        }

        // Build ONE item row HTML (all repeated fields live here)
        function itemRowHtml(i) {
            const n = i + 1;

            return `
            <tr data-item-row="${i}" class="border-b border-slate-100">
                <td class="px-3 py-3">
                <!-- Item wrapper -->
                <div class="rounded-2xl pm-items-dark shadow-sm overflow-hidden">

                    <!-- Item header -->
                    <div class="mb-4">
                        <span class="inline-flex items-center px-3 py-1.5 rounded-full text-[12px] font-extrabold pm-items-badge">
                            Item ${n}
                        </span>
                    </div>

                    <!-- Two boxes -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">

                    <!-- LEFT SIDE -->
                    <div class="rounded-2xl pm-items-surface p-4 h-full">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">

                        <div>
                            <div class="pm-items-label mb-1">Brand</div>
                            <input name="items[${i}][brand_name]" class="gts-input gts-editable" disabled>
                        </div>

                        <div>
                            <div class="pm-items-label mb-1">Certificate</div>
                            <input name="items[${i}][certificate_no]" class="gts-input gts-editable" disabled>
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

                        <div class="sm:col-span-2">
                            <div class="pm-items-label mb-1">Weight</div>
                            <div class="pm-weight-wrap space-y-1">
                            <select class="pm-weight-select gts-select gts-editable w-full" name="items[${i}][weight]" disabled>
                                <option value="">Select</option>

                                <optgroup label="GRAMS (G)">
                                <option value="5">5 g</option>
                                <option value="10">10 g</option>
                                <option value="15">15 g</option>
                                <option value="20">20 g</option>
                                <option value="31.1035">31.1035 g (1 oz)</option>
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

                    <!-- RIGHT SIDE -->
                    <div class="rounded-2xl pm-items-surface p-4 h-full">
                        <div class="grid grid-cols-1 gap-3">
                        <div>
                            <div class="pm-items-label mb-1">Purchase</div>
                            <input name="items[${i}][purchase_price]" type="text" inputmode="decimal" class="gts-input gts-editable" disabled>
                        </div>

                        <div>
                            <div class="pm-items-label mb-1">Sell</div>
                            <input name="items[${i}][sell_price]" type="text" inputmode="decimal" class="gts-input gts-editable" disabled>
                        </div>

                        <div>
                            <div class="pm-items-label mb-1">Sell Date</div>
                            <input name="items[${i}][sell_date]" type="date" class="gts-input gts-editable" disabled>

                            <button type="button"
                                class="pm-show-summary-btn mt-3 hidden w-full px-3 py-2 rounded-xl text-sm font-extrabold
                                    bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30"
                                data-action="show-in-summary">
                                Show in Inventory Summary
                            </button>
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

                    if (k === 'purchase_price' || k === 'sell_price') {
                        v = v ? formatAED(v) : '';
                    }

                    // NORMAL SETTER (all other keys)
                    $el.val(v);

                    // if it's a select, trigger change so dd2 label updates
                    if ($el.is('select')) $el.trigger('change');
                });
            });

            function ensureSelectValue($sel, value) {
                const v = String(value ?? '').trim();
                if (!v) return;

                // if the option doesn't exist, add it (so it can be selected)
                if ($sel.find(`option[value="${CSS.escape(v)}"]`).length === 0) {
                    $sel.append(new Option(v, v));
                }

                $sel.val(v);
            }

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

            updateHeaderPurchaseTotal($header, $detail);
            toggleShowSummaryBtn($detail);
        }

        function prettyTitle(s) {
            return (s || '—').replace(/\b\w/g, c => c.toUpperCase());
        }
        function prettyShapeLabel(s) {
            const map = { bar: 'Bar', coin: 'Coin', granules: 'Granules', packs: 'Packs', other: 'Other', unknown: 'Other' };
            const k = String(s || '').toLowerCase();
            return map[k] || (k.charAt(0).toUpperCase() + k.slice(1));
        }

        function flashOrGhostTile(metal, shape, shortW, opts = {}) {
            const forceGhost = !!opts.forceGhost;

            // make sure correct metal is visible (important)
            ACTIVE_METAL = metal;
            ACTIVE_SHAPE = 'All';

            // render summary
            buildSummaryFromDOM();

            // scroll to Inventory Summary
            document.getElementById('invSummary')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // if not forcing ghost, try flash existing tile
            const $found = $(`#invSummary .pmTile[data-metal="${metal}"][data-shape="${shape}"][data-weight="${shortW}"]`).first();
            if ($found.length && !forceGhost) {
                $found.addClass('pmTileFlash');
                setTimeout(() => $found.removeClass('pmTileFlash'), 1400);
                return;
            }

            // otherwise show SOLD ghost as first tile in the grid
            const longW = weightLongLabel(shortW);
            const accent = 'pm-accent-sold';
            const icon = metalIconPngHtml(metal, shape, 0);

            const ghost = $(`
                <div class="pmTile pmTileGhost ${accent}">
                <div class="pmTileTop">
                    <div class="pmTileImg">${icon}</div>
                    <div class="pmTileTxt">
                    <div class="pmTileWeight">${escapeHtml(shortW)}</div>
                    <div class="pmTileMeta">${escapeHtml(prettyTitle(metal))} ${escapeHtml(prettyShapeLabel(shape))} • SOLD</div>
                    </div>
                </div>
                <div class="pmTileBottom">
                    <div class="pmTileWeightOnly">${escapeHtml(longW)}</div>
                    <div class="pmTilePill pmTilePill--pcs pmTilePill--radial">1 pc</div>
                </div>
                </div>
            `);

            // put it as FIRST tile of the CURRENT metal grid (pushes others right)
            let $grid = $(`#invSummary .pm-inv-card[data-metal="${metal}"] .pm-inv-grid`).first();
            if (!$grid.length) $grid = $('#invSummary .pm-inv-grid').first();

            if ($grid.length) $grid.prepend(ghost);
            else $('#invSummary').prepend(ghost);

            setTimeout(() => ghost.remove(), 1700);
        }

        $tbody.on('click', '[data-action="show-in-summary"]', function (e) {
            e.preventDefault();
            e.stopPropagation();

            const $itemRow = $(this).closest('tr[data-item-row]');
            const $detail = $(this).closest('tr.pm-detail');

            const metal = normMetal($itemRow.find('select[name$="[metal_type]"]').val());
            const shape = normShape($itemRow.find('select[name$="[metal_shape]"]').val());
            const wRaw = $itemRow.find('select[name$="[weight]"]').val() || $itemRow.find('.pm-weight-custom').val();
            const shortW = weightLabelFromValue(wRaw);

            if (!metal || !shape || !shortW) {
                showInfo('Please fill Metal, Shape and Weight to locate it in Inventory Summary.');
                return;
            }

            flashOrGhostTile(metal, shape, shortW, { forceGhost: true });
        });

        function updateTotalsFromDOM() {
            let purchaseTotal = 0;
            let sellTotal = 0;

            $tbody.find('tr.pm-header[data-id]:not(.hidden)').each(function () {
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

        function normalizeWeightLabelToNumber(weightLabel) {
            // examples: "100 g", "31.1035 g (1 oz)", "62.206 g", "131.103 g"
            const m = String(weightLabel || '').match(/[\d.]+/);
            return m ? Number(m[0]) : NaN;
        }

        // exact color mapping requested (by grams)
        function weightAccentClass(weightLabel) {
            const w = normalizeWeightLabelToNumber(weightLabel);

            // You asked:
            // 100g -> gold
            // 131.103g -> light green
            // 81.103g -> light blue
            // 62.206g -> purple
            // (if more -> different colors)
            // We'll match with small tolerance because labels may be "131.103 g" etc.
            const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;

            if (!isNaN(w)) {
                if (near(w, 100)) return 'accent-w-gold';
                if (near(w, 131.103)) return 'accent-w-green';
                if (near(w, 81.103)) return 'accent-w-blue';
                if (near(w, 62.206) || near(w, 62.207)) return 'accent-w-purple';
            }

            // fallback rotation of extra colors for any other weights
            const extra = ['accent-w-rose', 'accent-w-amber', 'accent-w-teal', 'accent-w-slate'];
            // stable pick based on label text
            let hash = 0;
            const s = String(weightLabel || '');
            for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i);
            const idx = Math.abs(hash) % extra.length;
            return extra[idx];
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

        function buildSummaryFromDOM() {
            tileIdx = 0;
            const rows = [];

            // collect from visible rows (ONE row per ITEM)
            $tbody.find('tr.pm-header[data-id]:not(.hidden)').each(function () {
                const id = $(this).data('id');
                const $detail = $tbody.find(`tr.pm-detail[data-detail-for="${id}"]`);

                const items = getItemsForDetail($detail);

                items.forEach(it => {

                    const sellP = String(it.sell_price ?? '').trim();
                    const sellD = String(it.sell_date ?? '').trim();

                    // if sold -> hide from inventory summary
                    const isSold = (num(sellP) > 0) || !!sellD;
                    if (isSold) return;

                    // skip totally empty padded items
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

                    rows.push({ metal, shape, weightLabel });
                });
            });

            if (!rows.length) {
                $('#metalPicker').html('');
                $('#invSummary').html(`
                <div class="p-4 rounded-2xl border border-slate-200 text-slate-400 text-center bg-white">
                    No data
                </div>
                `);
                return;
            }

            const pretty = (s) => (s || '—').replace(/\b\w/g, c => c.toUpperCase());
            const metalOrder = ['gold', 'silver', 'platinum', 'miscellaneous', 'unknown'];

            // inv map metal -> shape -> weightLabel -> count
            const inv = new Map();

            rows.forEach(r => {
                const metal = (r.metal || 'unknown').trim();
                const shape = (r.shape || 'other').trim();
                const w = (r.weightLabel || 'Unknown').trim();

                // metal → shape map
                if (!inv.has(metal)) inv.set(metal, new Map());
                const shapeMap = inv.get(metal);

                // shape → weight map
                if (!shapeMap.has(shape)) shapeMap.set(shape, new Map());
                const weightMap = shapeMap.get(shape);

                // weight → count
                weightMap.set(w, (weightMap.get(w) || 0) + 1);
            });

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
                    const count = Array.from(inv.get(m).values()) // shape maps
                        .flatMap(wm => Array.from(wm.values()))
                        .reduce((a, b) => a + b, 0);
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

            const metalCount = Array.from(shapeMap.values())      // each is a shapeMap
                .flatMap(wm => Array.from(wm.values()))             // counts
                .reduce((a, b) => a + b, 0);

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
                        .sort((a, b) => b[1] - a[1])
                        .map(([wLabel, count]) => {
                            const shortW = String(wLabel || '').trim();              // e.g. "1 oz"
                            const longW = weightLongLabel(shortW);                 // e.g. "1 ounce"

                            const safeShort = escapeHtml(shortW);
                            const safeLong = escapeHtml(longW);
                            const idx = tileIdx++;
                            const accent = tileAccentClass(idx);
                            const icon = metalIconPngHtml(m, shapeKey, idx);

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
                            </div>
                            `;
                        });
                })
                .join('');

            const icon = metalIconHtml(m);

            const html = `
            <div class="pm-inv-card" data-metal="${m}">
                <div class="pm-inv-head">
                <div class="pm-inv-title pm-inv-title--icon">
                    <span class="pm-inv-metal-icon">${icon}</span>
                    <span class="pm-inv-metal-name">${pretty(m)}</span>
                </div>
                <div class="pm-inv-count">${metalCount} pcs</div>
                </div>
                <div class="pm-inv-grid">
                ${tiles}
                </div>
            </div>
            `;

            $('#invSummary').html(html);

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
                const pcs = Array.from(weightMap.values()).reduce((a, b) => a + b, 0);
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
        }

        $tbody.find('tr.pm-header[data-id]').each(function () {
            const $h = $(this);
            const id = $h.data('id');
            const $d = $tbody.find(`tr.pm-detail[data-detail-for="${id}"]`);
            updateHeaderPurchaseTotal($h, $d);
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
            const mode = ($('#filterMode').val() || '').toLowerCase().trim();
            const ben = ($('#filterBeneficiary').val() || '').toLowerCase().trim();

            // Only auto-close details when user is actually filtering/searching
            // For save flow (inPlace:true), DO NOT close (prevents losing UI state)
            if (!inPlace) {
                closeAllDetails();
            }

            $tbody.find('tr.pm-header[data-id]').each(function () {
                const $header = $(this);
                const id = $header.data('id');
                const $detail = $tbody.find(`tr.pm-detail[data-detail-for="${id}"]`);

                const hay = ($header.attr('data-search') || '').toLowerCase();

                const passQuery = !q || hay.includes(q);

                // keep your safe includes logic
                const passMetal = !metal || hay.includes(` ${metal}`) || hay.includes(metal);
                const passMode = !mode || hay.includes(` ${mode}`) || hay.includes(mode);

                const passBen = !ben || hay.includes(ben);

                const show = passQuery && passMetal && passMode && passBen;

                // Toggle header visibility
                $header.toggleClass('hidden', !show);

                if (!inPlace) {
                    // old behavior: always hide details during filtering
                    $detail.toggleClass('hidden', true);
                } else {
                    // save behavior: do NOT rebuild / reopen
                    // keep detail visibility ONLY if it was already open
                    // (or if it's the keepOpen row)
                    const shouldBeOpen =
                        (keepOpenId && String(id) === String(keepOpenId)) ||
                        !$detail.hasClass('hidden'); // already open stays open

                    // If header hidden, detail must be hidden
                    $detail.toggleClass('hidden', !(show && shouldBeOpen));
                }
            });

            // counts BOTH saved + draft headers (draft has no data-id)
            const hasAnyHeader = $tbody.find('tr.pm-header').length > 0;
            const hasSaved = $tbody.find('tr.pm-header[data-id]').length > 0;

            const anyVisible = $tbody.find('tr.pm-header:not(.hidden)').length > 0;

            // remove old "no matching"
            $tbody.find('tr[data-empty-filter]').remove();

            // show "No matching results" ONLY when user is actually filtering
            const isFiltering = !!q || !!metal || !!mode || !!ben;

            if (isFiltering) {
                if (!anyVisible && hasSaved) {
                    $tbody.append(`
                        <tr data-empty-filter="1">
                        <td colspan="7" class="p-6 text-center text-slate-500">No matching results.</td>
                        </tr>
                    `);
                }
            } else {
                // not filtering → never show "No matching results"
            }

            reindexVisible();
            updateTotalsFromDOM();
            buildSummaryFromDOM();

            // Keep open row:
            if (keepOpenId) {
                const $newHeader = $tbody.find(`tr.pm-header[data-id="${keepOpenId}"]`).first();
                const $newDetail = $tbody.find(`tr.pm-detail[data-detail-for="${keepOpenId}"]`).first();

                if ($newHeader.length && $newDetail.length && !$newHeader.hasClass('hidden')) {
                    if (!inPlace) {
                        // old behavior: reopen using your existing open function
                        openDetailForHeader($newHeader);
                    } else {
                        // inPlace: just ensure it's visible, NO rebuild
                        $newDetail.removeClass('hidden');
                    }
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
        $('#filterMetalType, #filterMode, #filterBeneficiary').on('change', applySearchAndFilters);

        $('#clearFilters').on('click', function () {
            $('#metalSearch').val('');
            $('#filterMetalType').val('');
            $('#filterMode').val('');
            $('#filterBeneficiary').val('');

            // add these:
            $('[data-dd="metal"] .dd-label').text('All Metals');
            $('[data-dd="mode"] .dd-label').text('All Modes');
            $('[data-dd="beneficiary"] .dd-label').text('All Beneficiaries');
            $('[data-dd] .dd-opt').removeClass('bg-indigo-50 text-indigo-700 font-semibold');
            $('[data-dd="metal"] .dd-opt[data-value=""]').addClass('bg-indigo-50 text-indigo-700 font-semibold');
            $('[data-dd="mode"] .dd-opt[data-value=""]').addClass('bg-indigo-50 text-indigo-700 font-semibold');
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

        // ---------- Custom dropdowns (FILTER ONLY) ----------
        (function initFilterDropdowns() {
            function closeAll() {
                $('[data-dd] .dd-panel').addClass('hidden');
            }

            // open/close
            $(document).on('click', '[data-dd] .dd-btn', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const $wrap = $(this).closest('[data-dd]');
                const $panel = $wrap.find('.dd-panel');

                // close others
                $('[data-dd]').not($wrap).find('.dd-panel').addClass('hidden');

                // toggle this one
                $panel.toggleClass('hidden');
            });

            // choose option
            $(document).on('click', '[data-dd] .dd-opt', function (e) {
                e.preventDefault();
                e.stopPropagation();

                const $opt = $(this);
                const val = $opt.data('value');
                const label = $.trim($opt.text());

                const $wrap = $opt.closest('[data-dd]');
                const $select = $wrap.find('select');
                const $label = $wrap.find('.dd-label');

                // set UI label + tooltip
                $label.text(label).attr('title', label);

                // set hidden select value + trigger change (your applySearchAndFilters listens to change)
                $select.val(val).trigger('change');

                // highlight selected in panel
                $wrap.find('.dd-opt').removeClass('bg-indigo-50 text-indigo-700 font-semibold');
                $opt.addClass('bg-indigo-50 text-indigo-700 font-semibold');

                // close panel
                $wrap.find('.dd-panel').addClass('hidden');
            });

            // close on outside click / ESC
            $(document).on('click', function () { closeAll(); });
            $(document).on('keydown', function (e) {
                if (e.key === 'Escape') closeAll();
            });

            // set initial highlights based on current select values
            $('[data-dd]').each(function () {
                const $wrap = $(this);
                const $select = $wrap.find('select');
                const current = $select.val() ?? '';
                const $match = $wrap.find(`.dd-opt[data-value="${current}"]`).first();

                if ($match.length) {
                    $wrap.find('.dd-label').text($.trim($match.text()));
                    $wrap.find('.dd-opt').removeClass('bg-indigo-50 text-indigo-700 font-semibold');
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
        });

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

        function openDetailAnimated($detail) {
            const $anim = $detail.find('.pm-detail-anim').first();
            if (!$anim.length) return;

            // show row first
            $detail.removeClass('hidden');

            // start closed (so transition can run)
            $anim.removeClass('is-open');
            $anim.css('--pm-detail-max', '0px');

            // next frame -> expand to real height
            requestAnimationFrame(() => {
                const h = $anim[0].scrollHeight || 0;
                $anim.css('--pm-detail-max', h + 'px');
                $anim.addClass('is-open');
            });
        }

        function closeDetailAnimated($detail) {
            const $anim = $detail.find('.pm-detail-anim').first();
            if (!$anim.length) {
                $detail.addClass('hidden');
                return;
            }

            // set current height so it can animate down to 0
            const h = $anim[0].scrollHeight || 0;
            $anim.css('--pm-detail-max', h + 'px');

            requestAnimationFrame(() => {
                $anim.removeClass('is-open');
                $anim.css('--pm-detail-max', '0px');
            });

            // after transition ends, hide the whole row
            $anim.one('transitionend', () => {
                $detail.addClass('hidden');
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

        // 2) Your FILTER dropdowns close on document click.
        //    Make sure they DON'T close when the user interacts with dd2.
        (function patchFilterCloseBehavior() {
            // remove old document click closer if you have it as a named function, otherwise just re-bind safely:
            $(document).off('click.ddFilterClose').on('click.ddFilterClose', function (e) {
                // if click is inside filter dropdown => ignore
                if ($(e.target).closest('[data-dd]').length) return;

                // if click is inside dd2 dropdown => ignore
                if ($(e.target).closest('.dd2, .dd2-panel').length) return;

                // otherwise close filter panels
                $('[data-dd] .dd-panel').addClass('hidden');
            });

            $(document).off('keydown.ddFilterClose').on('keydown.ddFilterClose', function (e) {
                if (e.key === 'Escape') $('[data-dd] .dd-panel').addClass('hidden');
            });
        })();

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

        // Reindex S.no visually
        function reindex() {
            let sn = 1;
            $tbody.find('tr').each(function () {
                const $cell = $(this).find('.snCell').first();
                if (!$cell.length) return;
                $cell.text(sn++);
            });
        }

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
        $('#attBrowseBtn').on('click', function () {
            $('#attUploadInput').trigger('click');
        });

        $('#attUploadInput').on('change', function () {
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
        $('#attUploadBtn').on('click', function () {
            if (!activeId) return;
            if (!selectedFiles.length) { showInfo('Please select files first.'); return; }

            const fd = new FormData();
            selectedFiles.forEach(f => fd.append('attachments[]', f));

            $.ajax({
                url: urlTmpl(METALS.attachmentsStore, activeId),
                method: 'POST',
                data: fd,
                processData: false,
                contentType: false,
                headers: { 'X-CSRF-TOKEN': METALS.csrf, 'Accept': 'application/json' }
            }).done(() => {
                selectedFiles = [];
                setSelectedLabel();
                $('#attUploadInput').val('');
                loadExistingIntoUploadModal(activeId);
            }).fail((xhr) => {
                console.error(xhr.responseText || xhr);
                showError('Upload failed. Check file type/size.');
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

        const PRICE_SEL =
            'input[name="purchase_price"], input[name="sell_price"], input[name$="[purchase_price]"], input[name$="[sell_price]"]';

        $tbody.on('focus', PRICE_SEL, function () {
            $(this).data('lastValid', $(this).val() ?? '');
            $(this).val(unformat($(this).val()));
        });

        $tbody.on('blur', PRICE_SEL, function () {
            const raw = unformat($(this).val()).trim();
            if (raw === '') { $(this).data('lastValid', ''); return; }

            const n = Number(raw);
            if (isNaN(n)) {
                $(this).val($(this).data('lastValid') || '');
                return;
            }

            const formatted = formatAED(n);
            $(this).val(formatted);
            $(this).data('lastValid', formatted);
        });

        $tbody.on('input', PRICE_SEL, function () {
            let v = String(this.value || '').replace(/[^0-9.]/g, ''); // (prices usually shouldn't be negative)
            const parts = v.split('.');
            if (parts.length > 2) v = parts.shift() + '.' + parts.join('');
            this.value = v;
        });

        $(document).on('click', '[data-metal-tab]', function () {
            ACTIVE_METAL = String($(this).attr('data-metal-tab') || '').toLowerCase();
            buildSummaryFromDOM();
        });

        $(document).on('click', '.pmShapeTab', function () {
            ACTIVE_SHAPE = String($(this).attr('data-shape') || 'All');
            if (ACTIVE_SHAPE !== 'All') ACTIVE_SHAPE = ACTIVE_SHAPE.toLowerCase();
            buildSummaryFromDOM();
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

                // normal fields copy
                $tr.find('input[name], select[name], textarea[name]').each(function () {
                    const field = String(this.name).replace(/^items\[\d+\]\[/, 'items[0][');
                    if (base[field] !== undefined) {
                        $(this).val(base[field]).trigger('change').trigger('input');
                    }
                });

                // special handling for weight custom value
                const $wSel = $tr.find('select[name$="[weight]"]');
                const $wCustom = $tr.find('.pm-weight-custom');

                if (!$wSel.length) return;

                if (String(baseWeightSel) === 'custom') {
                    // set select to custom + show custom input + copy value
                    $wSel.val('custom').trigger('change').trigger('input');
                    $wCustom.removeClass('hidden').val(baseWeightCustom).trigger('input');
                } else {
                    // normal option weight
                    $wSel.val(baseWeightSel).trigger('change').trigger('input');
                    $wCustom.addClass('hidden').val('');
                }
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

        // whenever sell fields change
        $tbody.on('input change', 'input[name$="[sell_price]"], input[name$="[sell_date]"]', function () {
            const $detail = $(this).closest('tr.pm-detail');
            toggleShowSummaryBtn($detail);
        });

    });

})(jQuery);