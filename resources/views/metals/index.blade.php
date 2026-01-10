<!doctype html>
<html lang="en">

<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="csrf-token" content="{{ csrf_token() }}">

    <title>Precious Metals Ledger</title>

    <link rel="stylesheet" href="{{ asset('metals.css') }}">
    {{-- Tailwind CDN (for quick project). If you already have Tailwind build, remove this. --}}
    <script src="https://cdn.tailwindcss.com"></script>

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />

    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>

    {{-- Optional nice font --}}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">

</head>

<body class="bg-slate-50 text-slate-900">


    <!-- GTS Tools Header (breadcrumb style) -->
    <div class="bg-white border-b border-slate-200">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            <div class="text-sm font-medium text-slate-700">
                GTS • Tools
            </div>

            <div class="text-sm text-slate-500">
                Metals Ledger
            </div>
        </div>
    </div>

    <div class="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">

        {{-- TOP BAR --}}
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
                <h1 class="text-2xl font-semibold">Precious Metals Ledger</h1>
                <p class="text-sm text-slate-500">
                    Track Gold / Silver / Platinum purchases & sales with attachments.
                </p>
            </div>

            <button id="openCreate"
                class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                        bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600
                        text-white font-medium
                        shadow-lg shadow-indigo-600/20
                        hover:from-indigo-500 hover:via-purple-500 hover:to-fuchsia-500
                        active:scale-[0.98] transition-all">
                <span class="text-lg leading-none">+</span>
                Add Entry
            </button>
        </div>

        {{-- FLASH --}}
        @if(session('success'))
        <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
            {{ session('success') }}
        </div>
        @endif

        @if ($errors->any())
        <div class="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
            <div class="font-semibold mb-1">Fix these:</div>
            <ul class="list-disc ml-5">
                @foreach($errors->all() as $err)
                <li>{{ $err }}</li>
                @endforeach
            </ul>
        </div>
        @endif

        <!-- Totals -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <!-- Purchase Total -->
            <div class="pm-kpi pm-kpi--purchase">
                <div class="pm-kpi-icon">
                    <i class="bi bi-cart3"></i>
                </div>
                <div>
                    <div class="pm-kpi-label">Total Purchase</div>
                    <div id="totalPurchase" class="pm-kpi-value">AED 0.00</div>
                </div>
            </div>

            <!-- Sell Total -->
            <div class="pm-kpi pm-kpi--sell">
                <div class="pm-kpi-icon">
                    <i class="bi bi-cash-coin"></i>
                </div>
                <div>
                    <div class="pm-kpi-label">Total Sell</div>
                    <div id="totalSell" class="pm-kpi-value">AED 0.00</div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 gap-4">
            <div>
                <div class="flex items-center justify-between mb-2">
                    <div class="text-sm text-slate-500">Inventory Summary</div>
                </div>

                <!-- Metal selector (Au / Ag / Pt) -->
                <div id="metalPicker" class="mb-3"></div>

                <!-- Shape selector (Bar / Coin / Granules / etc) -->
                <div id="pmShapeTabs" class="mb-3"></div>

                <!-- Inventory cards -->
                <div id="invSummary" class="space-y-3"></div>
            </div>
        </div>

        <!-- NEW ROW TEMPLATE (hidden) -->
        <table class="hidden">
            <tbody>

                <!-- HEADER TEMPLATE -->
                <tr id="newHeaderTemplate"
                    class="pm-header view-mode odd:bg-white even:bg-slate-50/70 hover:bg-indigo-50/70 transition border-b border-slate-200"
                    data-new="1"
                    data-tmp="__TMP__">

                    <td class="px-3 py-2 font-semibold text-slate-700 snCell">—</td>

                    <td class="px-3 py-2">
                        <input name="purchase_date" type="date"
                            class="gts-input gts-editable" disabled required>
                    </td>

                    <td class="px-3 py-2">
                        <input name="invoice_no" type="text"
                            class="gts-input gts-editable" disabled required>
                    </td>

                    <td class="px-3 py-2">
                        <input name="supplier_name" type="text"
                            class="gts-input gts-editable" disabled>
                    </td>

                    <td class="px-3 py-2">
                        <input name="qty" type="number" min="1" value="1"
                            class="gts-input gts-editable text-center font-medium" disabled>
                    </td>

                    <td class="px-3 py-2">
                        <input name="beneficiary_name" type="text"
                            class="gts-input gts-editable" disabled>
                    </td>

                    <td class="px-3 py-2 w-[160px]">
                        <input type="text" class="pm-row-total text-center" value="AED 0.00" disabled readonly>
                    </td>

                    <td class="px-3 py-2 w-[190px]">
                        <div class="pm-actions flex items-center justify-end gap-2 whitespace-nowrap">
                            <!-- Submit -->
                            <button type="button"
                                class="pm-act bg-emerald-600 hover:bg-emerald-700"
                                data-action="submit-draft" data-no-toggle="1" title="Submit">
                                <i class="bi bi-check2"></i>
                            </button>

                            <!-- Cancel -->
                            <button type="button"
                                class="pm-act bg-slate-500 hover:bg-slate-600"
                                data-action="cancel-draft" data-no-toggle="1" title="Cancel">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </td>
                </tr>

                <!-- DETAIL TEMPLATE -->
                <tr id="newDetailTemplate"
                    class="pm-detail bg-slate-50/40"
                    data-new="1"
                    data-detail-for="__TMP__">

                    <td colspan="8" class="p-4 bg-slate-50">
                        <div class="pm-detail-anim space-y-4">

                            <!-- SHARED FIELDS -->
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

                                <div class="md:col-span-2 lg:col-span-4">
                                    <div class="text-xs text-slate-500 mb-1">Description</div>
                                    <textarea name="description" rows="2"
                                        class="gts-input gts-editable min-h-[44px]" disabled></textarea>
                                </div>

                                <div>
                                    <label class="text-xs text-slate-500">Mode of Transaction</label>
                                    <select name="mode_of_transaction" class="gts-select gts-editable" disabled>
                                        <option value="">Select</option>
                                        <option value="cash">Cash</option>
                                        <option value="bank">Bank</option>
                                        <option value="cheque">Cheque</option>
                                    </select>
                                </div>

                                <div>
                                    <label class="text-xs text-slate-500">Receipt No</label>
                                    <input name="receipt_no" class="gts-input gts-editable" disabled>
                                </div>

                                <div class="md:col-span-2">
                                    <label class="text-xs text-slate-500">Remarks</label>
                                    <textarea name="remarks" rows="2"
                                        class="gts-input gts-editable" disabled></textarea>
                                </div>

                            </div>

                            <!-- ITEMS (REPEATED BY QTY) -->
                            <div class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                                <div class="px-4 py-3 flex items-center justify-between border-b border-slate-200">
                                    <div>
                                        <div class="font-semibold text-slate-800">Items</div>
                                        <div class="text-xs text-slate-500">Rows will follow Qty</div>
                                    </div>

                                    <button type="button"
                                        class="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold"
                                        data-action="copy-item-1-all" data-no-toggle="1">
                                        Copy Item 1 → all
                                    </button>
                                </div>

                                <div class="overflow-x-auto">
                                    <table class="w-full text-sm min-w-[900px]">
                                        <thead class="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th class="px-3 py-2 w-16 text-left font-semibold text-slate-700">#</th>
                                                <th class="px-3 py-2 text-left font-semibold text-slate-700">Brand</th>
                                                <th class="px-3 py-2 text-left font-semibold text-slate-700">Certificate</th>
                                                <th class="px-3 py-2 text-left font-semibold text-slate-700">Metal</th>
                                                <th class="px-3 py-2 text-left font-semibold text-slate-700">Shape</th>
                                                <th class="px-3 py-2 text-left font-semibold text-slate-700">Weight</th>
                                                <th class="px-3 py-2 text-left font-semibold text-slate-700">Purchase</th>
                                                <th class="px-3 py-2 text-left font-semibold text-slate-700">Sell</th>
                                                <th class="px-3 py-2 text-left font-semibold text-slate-700">Sell Date</th>
                                            </tr>
                                        </thead>

                                        <tbody data-items-tbody>
                                            <!-- JS will inject 1..qty rows here -->
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </div>
                    </td>
                </tr>

            </tbody>
        </table>

        <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div class="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                <div class="flex-1">
                    <input id="metalSearch" type="text"
                        placeholder="Search supplier, beneficiary, metal type, brand, receipt no, remarks..."
                        class="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300" />
                </div>

                <div class="flex flex-wrap gap-2 justify-end">
                    <!-- FILTER: Metal Type (custom) -->
                    <div class="relative" data-dd="metal">
                        <!-- Hidden real select (keeps your existing JS working) -->
                        <select id="filterMetalType" class="hidden">
                            <option value="">All Metals</option>
                            <option value="gold">Gold</option>
                            <option value="silver">Silver</option>
                            <option value="platinum">Platinum</option>
                            <option value="miscellaneous">Miscellaneous</option>
                        </select>

                        <!-- Button -->
                        <button type="button"
                            class="dd-btn w-44 sm:w-48 h-11 px-4 pr-10 rounded-2xl text-left
                                    border border-slate-200 bg-white shadow-sm ring-1 ring-black/5
                                    hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-indigo-200 focus:border-indigo-300
                                    transition relative">
                            <span class="dd-label text-sm font-medium text-slate-800">All Metals</span>
                            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" clip-rule="evenodd" />
                                </svg>
                            </span>
                        </button>

                        <!-- Options panel -->
                        <div class="dd-panel hidden absolute z-50 mt-2 w-full rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/10 overflow-hidden">
                            <div class="p-2">
                                <div class="dd-opt px-3 py-2 rounded-xl text-sm hover:bg-slate-50 cursor-pointer" data-value="">
                                    All Metals
                                </div>
                                <div class="dd-opt px-3 py-2 rounded-xl text-sm hover:bg-slate-50 cursor-pointer" data-value="gold">
                                    Gold
                                </div>
                                <div class="dd-opt px-3 py-2 rounded-xl text-sm hover:bg-slate-50 cursor-pointer" data-value="silver">
                                    Silver
                                </div>
                                <div class="dd-opt px-3 py-2 rounded-xl text-sm hover:bg-slate-50 cursor-pointer" data-value="platinum">
                                    Platinum
                                </div>
                                <div class="dd-opt px-3 py-2 rounded-xl text-sm hover:bg-slate-50 cursor-pointer" data-value="miscellaneous">
                                    Miscellaneous
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- FILTER: Beneficiary (custom) -->
                    <div class="relative" data-dd="beneficiary">
                        <!-- Hidden real select -->
                        <select id="filterBeneficiary" class="hidden">
                            <option value="">All Beneficiaries</option>

                            @php
                            $beneficiaries = collect($entries)
                            ->pluck('beneficiary_name')
                            ->filter(fn($v) => trim((string)$v) !== '')
                            ->map(fn($v) => trim((string)$v))
                            ->unique()
                            ->sort()
                            ->values();
                            @endphp

                            @foreach($beneficiaries as $b)
                            <option value="{{ strtolower($b) }}">{{ $b }}</option>
                            @endforeach
                        </select>

                        <!-- Button -->
                        <button type="button"
                            class="dd-btn w-52 sm:w-56 h-11 px-4 pr-10 rounded-2xl text-left overflow-hidden
                                    border border-slate-200 bg-white shadow-sm ring-1 ring-black/5
                                    hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-indigo-200 focus:border-indigo-300
                                    transition relative">
                            <span class="dd-label block text-sm font-medium text-slate-800 truncate pr-6">All Beneficiaries</span>
                            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" clip-rule="evenodd" />
                                </svg>
                            </span>
                        </button>

                        <!-- Options panel -->
                        <div class="dd-panel hidden absolute z-50 mt-2 w-full rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/10 overflow-hidden">
                            <div class="p-2 max-h-64 overflow-auto">
                                <div class="dd-opt px-3 py-2 rounded-xl text-sm hover:bg-slate-50 cursor-pointer" data-value="">
                                    All Beneficiaries
                                </div>

                                @foreach($beneficiaries as $b)
                                <div class="dd-opt px-3 py-2 rounded-xl text-sm hover:bg-slate-50 cursor-pointer"
                                    data-value="{{ strtolower($b) }}">
                                    {{ $b }}
                                </div>
                                @endforeach
                            </div>
                        </div>
                    </div>

                    <!-- FILTER: Mode (custom) -->
                    <div class="relative" data-dd="mode">
                        <!-- Hidden real select -->
                        <select id="filterMode" class="hidden">
                            <option value="">All Modes</option>
                            <option value="cash">Cash</option>
                            <option value="bank">Bank</option>
                            <option value="cheque">Cheque</option>
                        </select>

                        <!-- Button -->
                        <button type="button"
                            class="dd-btn w-40 sm:w-44 h-11 px-4 pr-10 rounded-2xl text-left
                                    border border-slate-200 bg-white shadow-sm ring-1 ring-black/5
                                    hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-indigo-200 focus:border-indigo-300
                                    transition relative">
                            <span class="dd-label text-sm font-medium text-slate-800">All Modes</span>
                            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08z" clip-rule="evenodd" />
                                </svg>
                            </span>
                        </button>

                        <!-- Options panel -->
                        <div class="dd-panel hidden absolute z-50 mt-2 w-full rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/10 overflow-hidden">
                            <div class="p-2">
                                <div class="dd-opt px-3 py-2 rounded-xl text-sm hover:bg-slate-50 cursor-pointer" data-value="">
                                    All Modes
                                </div>
                                <div class="dd-opt px-3 py-2 rounded-xl text-sm hover:bg-slate-50 cursor-pointer" data-value="cash">
                                    Cash
                                </div>
                                <div class="dd-opt px-3 py-2 rounded-xl text-sm hover:bg-slate-50 cursor-pointer" data-value="bank">
                                    Bank
                                </div>
                                <div class="dd-opt px-3 py-2 rounded-xl text-sm hover:bg-slate-50 cursor-pointer" data-value="cheque">
                                    Cheque
                                </div>
                            </div>
                        </div>
                    </div>

                    <button type="button" id="clearFilters"
                        class="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50">
                        Clear
                    </button>
                </div>
            </div>
        </div>

        {{-- TABLE CARD --}}
        <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div class="overflow-x-auto w-full overflow-y-hidden [-webkit-overflow-scrolling:touch]">
                <table class="w-full text-sm table-fixed min-w-full md:min-w-[980px] lg:min-w-full">
                    <thead class="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-700 shadow-[0_8px_20px_rgba(2,6,23,0.06)]">
                        <tr class="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
                            <th class="px-3 py-2 text-left font-semibold text-white/90 w-16">S.no</th>
                            <th class="px-3 py-2 text-left font-semibold text-white/90 w-40">Date of purchase</th>
                            <th class="px-3 py-2 text-left font-semibold text-white/90 w-44">Invoice #</th>
                            <th class="px-3 py-2 text-left font-semibold text-white/90 w-52">Supplier</th>
                            <th class="px-3 py-2 text-left font-semibold text-white/90 w-24">Qty</th>
                            <th class="px-3 py-2 text-left font-semibold text-white/90 w-52">Beneficiary</th>
                            <th class="px-3 py-2 text-right font-semibold text-white/90 w-[140px]">Total Purchase</th>
                            <th class="px-3 py-2 text-right font-semibold text-white/90 w-[170px]">Actions</th>
                        </tr>
                    </thead>

                    <tbody id="metalTbody" class="divide-y divide-slate-100">
                        @forelse($entries as $i => $e)

                        @php
                        $itemsText = collect($e->items ?? [])
                        ->map(fn($it) => implode(' ', [
                        $it['brand_name'] ?? '',
                        $it['metal_type'] ?? '',
                        $it['metal_shape'] ?? '',
                        $it['certificate_no'] ?? '',
                        $it['weight'] ?? '',
                        ]))
                        ->implode(' ');
                        @endphp

                        {{-- HEADER ROW (always visible) --}}
                        <tr data-id="{{ $e->id }}"
                            data-search="{{ strtolower(
                                ($e->purchase_date?->format('Y-m-d').' ').
                                ($e->invoice_no.' ').
                                ($e->supplier_name.' ').
                                ($e->qty.' ').
                                ($e->beneficiary_name.' ').
                                ($e->mode_of_transaction.' ').
                                ($e->receipt_no.' ').
                                ($e->remarks.' ').
                                ($e->description.' ').
                                ($itemsText.' ')
                            ) }}"
                            class="pm-header view-mode cursor-pointer hover:bg-indigo-50/70 transition">
                            <td class="px-3 py-2 font-semibold text-slate-700 snCell">{{ $i+1 }}</td>

                            <td class="px-3 py-2">
                                <input name="purchase_date" type="date"
                                    value="{{ $e->purchase_date?->format('Y-m-d') }}"
                                    class="gts-input gts-editable" disabled>
                            </td>

                            <td class="px-3 py-2">
                                <input name="invoice_no" type="text"
                                    value="{{ $e->invoice_no }}"
                                    class="gts-input gts-editable"
                                    disabled>
                            </td>

                            <td class="px-3 py-2">
                                <input name="supplier_name" type="text"
                                    value="{{ $e->supplier_name }}"
                                    class="gts-input gts-editable" disabled>
                            </td>

                            <td class="px-3 py-2">
                                <input name="qty" type="number" min="1"
                                    value="{{ $e->qty }}"
                                    class="gts-input gts-editable text-center font-medium" disabled>
                            </td>

                            <td class="px-3 py-2">
                                <input name="beneficiary_name" type="text"
                                    value="{{ $e->beneficiary_name }}"
                                    class="gts-input gts-editable" disabled>
                            </td>

                            <td class="px-3 py-2 w-[160px]">
                                <input type="text" class="pm-row-total text-center" value="AED 0.00" disabled readonly>
                            </td>

                            <td class="px-3 py-2 w-[190px]">
                                <div class="flex items-center justify-end gap-2 whitespace-nowrap">

                                    {{-- Save --}}
                                    <button type="button"
                                        class="pm-act hidden bg-emerald-600 hover:bg-emerald-700"
                                        data-action="save" title="Save Changes" data-no-toggle="1">
                                        <i class="bi bi-check2"></i>
                                    </button>

                                    {{-- Cancel --}}
                                    <button type="button"
                                        class="pm-act hidden bg-slate-500 hover:bg-slate-600"
                                        data-action="cancel" title="Cancel" data-no-toggle="1">
                                        <i class="bi bi-x-lg"></i>
                                    </button>

                                    {{-- Upload --}}
                                    <button type="button"
                                        class="pm-act bg-sky-600 hover:bg-sky-700"
                                        title="Upload Attachments"
                                        data-action="upload-attachments" data-id="{{ $e->id }}" data-no-toggle="1">
                                        <i class="bi bi-cloud-arrow-up"></i>
                                    </button>

                                    {{-- View --}}
                                    <button type="button"
                                        class="pm-act bg-indigo-600 hover:bg-indigo-700"
                                        title="Attachments Viewer"
                                        data-action="view-attachments" data-id="{{ $e->id }}" data-no-toggle="1">
                                        <i class="bi bi-paperclip"></i>
                                    </button>

                                    {{-- Delete --}}
                                    <form class="delForm" method="POST" action="{{ route('metals.destroy', $e) }}">
                                        @csrf
                                        @method('DELETE')
                                        <button type="submit"
                                            class="pm-act bg-rose-600 hover:bg-rose-700"
                                            title="Delete entry"
                                            data-no-toggle="1">
                                            <i class="bi bi-trash3"></i>
                                        </button>
                                    </form>

                                </div>
                            </td>
                        </tr>

                        @php
                        $items = is_array($e->items) ? $e->items : (json_decode($e->items ?? '[]', true) ?: []);
                        @endphp

                        {{-- DETAIL ROW (hidden by default) --}}
                        <tr class="pm-detail hidden bg-slate-50/40" data-detail-for="{{ $e->id }}" data-items='@json($e->items ?? [])'>
                            <td colspan="8" class="p-4 bg-slate-50">
                                <div class="space-y-4">

                                    <!-- SHARED FIELDS -->
                                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

                                        <div class="md:col-span-2 lg:col-span-4">
                                            <div class="text-xs text-slate-500 mb-1">Description</div>
                                            <textarea name="description" rows="2"
                                                class="gts-input gts-editable min-h-[44px]" disabled>{{ $e->description }}</textarea>
                                        </div>

                                        <div>
                                            <label class="text-xs text-slate-500">Mode of Transaction</label>
                                            <select name="mode_of_transaction" class="gts-select gts-editable" disabled>
                                                <option value="">Select</option>
                                                <option value="cash" @selected($e->mode_of_transaction === 'cash')>Cash</option>
                                                <option value="bank" @selected($e->mode_of_transaction === 'bank')>Bank</option>
                                                <option value="cheque" @selected($e->mode_of_transaction === 'cheque')>Cheque</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label class="text-xs text-slate-500">Receipt No</label>
                                            <input name="receipt_no" class="gts-input gts-editable" value="{{ $e->receipt_no }}" disabled>
                                        </div>

                                        <div class="md:col-span-2">
                                            <label class="text-xs text-slate-500">Remarks</label>
                                            <textarea name="remarks" rows="2"
                                                class="gts-input gts-editable" disabled>{{ $e->remarks }}</textarea>
                                        </div>

                                    </div>

                                    <!-- ITEMS (REPEATED BY QTY) -->
                                    <div class="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                                        <div class="px-4 py-3 flex items-center justify-between border-b border-slate-200">
                                            <div>
                                                <div class="font-semibold text-slate-800">Items</div>
                                                <div class="text-xs text-slate-500">Rows will follow Qty</div>
                                            </div>

                                            <button type="button"
                                                class="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold"
                                                data-action="copy-item-1-all" data-no-toggle="1">
                                                Copy Item 1 → all
                                            </button>
                                        </div>

                                        <div class="overflow-x-auto">
                                            <table class="w-full text-sm min-w-[900px]">
                                                <thead class="bg-slate-50 border-b border-slate-200">
                                                    <tr>
                                                        <th class="px-3 py-2 w-16 text-left font-semibold text-slate-700">#</th>
                                                        <th class="px-3 py-2 text-left font-semibold text-slate-700">Brand</th>
                                                        <th class="px-3 py-2 text-left font-semibold text-slate-700">Certificate</th>
                                                        <th class="px-3 py-2 text-left font-semibold text-slate-700">Metal</th>
                                                        <th class="px-3 py-2 text-left font-semibold text-slate-700">Shape</th>
                                                        <th class="px-3 py-2 w-40 text-left font-semibold text-slate-700">Weight</th>
                                                        <th class="px-3 py-2 text-left font-semibold text-slate-700">Purchase</th>
                                                        <th class="px-3 py-2 text-left font-semibold text-slate-700">Sell</th>
                                                        <th class="px-3 py-2 text-left font-semibold text-slate-700">Sell Date</th>
                                                    </tr>
                                                </thead>

                                                <tbody data-items-tbody>
                                                    <!-- JS will inject 1..qty rows here -->
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                </div>
                            </td>
                        </tr>

                        @empty
                        <tr data-empty="1">
                            <td colspan="7" class="p-6 text-center text-slate-500">No entries yet.</td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>

    </div>

    {{-- Upload Modal --}}
    <div id="attUploadModal" class="pm-modal hidden fixed inset-0 z-[9999]">
        <div class="pm-backdrop absolute inset-0"></div>

        <div class="pm-modal-wrap">
            <div class="pm-panel pm-panel--upload">
                <div class="pm-panel-head flex items-center justify-between px-6 py-4">
                    <div>
                        <div class="text-lg font-semibold">Upload Attachments</div>
                        <div class="text-xs pm-subtext">PDF and images only, max 25MB each.</div>
                    </div>
                    <button type="button" class="pm-close-btn" id="attUploadClose">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>

                <div class="pm-panel-body p-6 space-y-4">
                    <input id="attUploadInput" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" class="hidden">

                    <div id="attDropZone" class="pm-dropzone p-10 text-center">
                        <div class="text-sm text-slate-700">Drag & drop files here</div>
                        <div class="text-xs pm-subtext mt-1">or</div>

                        <button type="button" id="attBrowseBtn" class="pm-btn pm-btn-secondary mt-4">
                            <i class="bi bi-folder2-open"></i> Browse files
                        </button>
                    </div>

                    <div class="text-sm pm-subtext" id="attSelectedLabel">No files selected yet.</div>

                    <div class="border-t border-slate-200 pt-4">
                        <div class="text-sm font-semibold mb-2">Existing attachments</div>
                        <div id="attExistingList" class="space-y-2 max-h-40 overflow-auto"></div>
                    </div>
                </div>

                <div class="pm-panel-foot flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
                    <button type="button" id="attUploadCancel" class="pm-btn pm-btn-secondary">Cancel</button>

                    <!-- improved: single clean primary button -->
                    <button type="button" id="attUploadBtn" class="pm-btn pm-btn-primary">
                        <i class="bi bi-cloud-arrow-up"></i> Upload
                    </button>
                </div>
            </div>
        </div>
    </div>

    {{-- Viewer Modal --}}
    <div id="attViewerModal" class="pm-modal hidden fixed inset-0 z-[9999]">
        <div class="pm-backdrop absolute inset-0"></div>

        <div class="pm-modal-wrap">
            <div class="pm-panel pm-panel--viewer">
                <div class="pm-panel-head flex items-center justify-between px-6 py-4">
                    <div class="text-lg font-semibold">Attachments Viewer</div>
                    <button type="button" class="pm-close-btn" id="attViewerClose">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>

                <div class="pm-panel-body grid grid-cols-12">
                    <div class="col-span-4 border-r border-slate-200 p-4">
                        <div id="attViewerList" class="space-y-2"></div>
                    </div>

                    <div class="col-span-8 p-4">
                        <div class="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden h-[440px]">
                            <iframe id="attPreviewFrame" class="w-full h-full hidden"></iframe>
                            <img id="attPreviewImg" class="w-full h-full object-contain hidden" />
                            <div id="attPreviewEmpty" class="h-full flex items-center justify-center text-slate-500">
                                Select a file to preview
                            </div>
                        </div>

                        <div class="flex items-center justify-between mt-4">
                            <div class="flex items-center gap-2">
                                <button type="button" id="attZoomOut" class="pm-btn pm-btn-secondary">−</button>
                                <button type="button" id="attZoomIn" class="pm-btn pm-btn-secondary">+</button>
                                <button type="button" id="attZoomReset" class="pm-btn pm-btn-secondary">Reset</button>
                                <button type="button" id="attZoomFit" class="pm-btn pm-btn-secondary">Fit</button>
                            </div>

                            <div class="flex items-center gap-3">
                                <a id="attDownloadBtn" href="#" class="pm-btn pm-btn-secondary">
                                    <i class="bi bi-download"></i> Download
                                </a>

                                <a id="attDownloadAllBtn" href="#" class="pm-btn pm-btn-primary">
                                    <i class="bi bi-download"></i> Download All
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Global App Modal (replaces alert/confirm) -->
    <div id="appModal" class="fixed inset-0 z-[9999] hidden">
        <div class="absolute inset-0 bg-black/60"></div>

        <div class="relative mx-auto mt-24 w-[92%] max-w-md">
            <div class="rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
                <div class="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
                    <div id="appModalIcon" class="text-xl"></div>
                    <div class="flex-1">
                        <div id="appModalTitle" class="font-semibold text-slate-900">Message</div>
                        <div id="appModalMsg" class="text-sm text-slate-600 mt-1"></div>
                    </div>
                    <button type="button" id="appModalCloseX" class="text-slate-500 hover:text-slate-900">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>

                <div class="px-5 py-4 flex justify-end gap-2">
                    <button type="button" id="appModalCancel"
                        class="hidden px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50">
                        Cancel
                    </button>

                    <button type="button" id="appModalOk"
                        class="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800">
                        OK
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Toast (bottom-right) -->
    <div id="toastWrap" class="fixed bottom-5 right-5 z-[9999] space-y-3 pointer-events-none"></div>

    <!-- Confirm Modal (Yes/No) -->
    <div id="confirmModal" class="fixed inset-0 z-[9998] hidden">
        <div class="absolute inset-0 bg-black/60"></div>

        <div class="relative mx-auto mt-28 w-[92%] max-w-md">
            <div class="rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
                <div class="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div class="font-semibold text-slate-900" id="confirmTitle">Confirm</div>
                    <button type="button" id="confirmCloseX" class="text-slate-500 hover:text-slate-900">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>

                <div class="px-5 py-4 text-sm text-slate-700" id="confirmMsg"></div>

                <div class="px-5 py-4 flex justify-end gap-2">
                    <button type="button" id="confirmCancel"
                        class="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50">
                        Cancel
                    </button>

                    <button type="button" id="confirmOk"
                        class="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800">
                        Yes
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script>
        window.METALS = {
            csrf: "{{ csrf_token() }}",
            storeUrl: "{{ route('metals.store') }}",
            updateUrlTmpl: "{{ url('/metals/__ID__') }}",
            attachmentsIndex: "{{ route('metals.attachments.index', '__ID__') }}",
            attachmentsStore: "{{ route('metals.attachments.store', '__ID__') }}",
            attachmentsDestroy: "{{ route('metals.attachments.destroy', '__ID__') }}",
            attachmentsDownload: "{{ route('metals.attachments.download', '__ID__') }}",
            attachmentsDownloadAll: "{{ route('metals.attachments.downloadAll', '__ID__') }}"
        };
    </script>

    <script src="{{ asset('metals.js') }}"></script>

</body>

</html>