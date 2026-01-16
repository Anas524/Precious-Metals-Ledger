<?php

namespace App\Http\Controllers;

use App\Models\MetalEntry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Support\Str;
use ZipArchive;

class MetalEntryController extends Controller
{
    public function index()
    {
        $entries = MetalEntry::orderBy('id', 'asc')->get();
        return view('metals.index', compact('entries'));
    }

    public function store(Request $request)
    {
        $data = $this->validateData($request);

        $data['qty'] = $data['qty'] ?? 1;

        // normalize items (ensure array length matches qty)
        $items = $request->input('items', []);
        $items = is_array($items) ? array_values($items) : [];

        // keep only up to qty
        $items = array_slice($items, 0, (int) $data['qty']);

        // if qty bigger than items, pad empty rows
        while (count($items) < (int) $data['qty']) {
            $items[] = [];
        }

        $data['items'] = $items;

        $entry = MetalEntry::create($data);

        $entry->update([
            'attachments' => $this->storeAttachments($request, [], $entry->id),
        ]);

        return back()->with('success', 'Metal entry added.');
    }

    public function update(Request $request, MetalEntry $metalEntry)
    {
        $data = $this->validateData($request, true, $metalEntry);

        $data['qty'] = $data['qty'] ?? ($metalEntry->qty ?? 1);

        // normalize items (match qty)
        $items = $request->has('items')
            ? $request->input('items', [])
            : ($metalEntry->items ?? []);

        $items = is_array($items) ? array_values($items) : [];
        $items = array_slice($items, 0, (int) $data['qty']);
        
        while (count($items) < (int) $data['qty']) {
            $items[] = [];
        }

        $data['items'] = $items;

        // keep attachments logic
        $existing = $metalEntry->attachments ?? [];
        $data['attachments'] = $this->storeAttachments($request, $existing, $metalEntry->id);

        $metalEntry->update($data);

        return response()->json(['ok' => true]);
    }

    public function destroy(MetalEntry $metalEntry)
    {
        // delete files from storage
        foreach (($metalEntry->attachments ?? []) as $path) {
            Storage::disk('public')->delete($path);
        }
        $metalEntry->delete();

        return back()->with('success', 'Entry deleted.');
    }

    public function deleteAttachment(MetalEntry $metalEntry, Request $request)
    {
        $request->validate(['path' => 'required|string']);
        $path = $request->path;

        if (!in_array($path, $metalEntry->attachments ?? [])) {
            abort(403);
        }

        $files = array_values(array_filter(($metalEntry->attachments ?? []), fn($p) => $p !== $path));

        Storage::disk('public')->delete($path);
        $metalEntry->update(['attachments' => $files]);

        return back()->with('success', 'Attachment removed.');
    }

    private function validateData(Request $request, bool $isUpdate = false, ?MetalEntry $entry = null): array
    {
        $id = $entry?->id;

        return $request->validate([
            'invoice_no' => [
                'required',
                'string',
                'max:255',
                $isUpdate
                    ? Rule::unique('metal_entries', 'invoice_no')->ignore($id)
                    : Rule::unique('metal_entries', 'invoice_no'),
            ],
            'purchase_date' => ['required', 'date'],

            'items' => ['sometimes', 'nullable', 'array'],
            'items.*.brand_name' => ['nullable', 'string', 'max:255'],
            'items.*.certificate_no' => ['nullable', 'string', 'max:255'],
            'items.*.metal_type' => ['nullable', 'in:gold,silver,platinum,miscellaneous'],
            'items.*.metal_shape' => ['nullable', 'string', 'max:50'],
            'items.*.weight' => ['nullable', 'numeric', 'min:0'],
            'items.*.purchase_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.sell_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.sell_date' => ['nullable', 'date'],
            'items.*.description' => ['nullable', 'string'],

            // EVERYTHING ELSE OPTIONAL
            'metal_type' => ['nullable', 'in:gold,silver,platinum,miscellaneous'],
            'metal_shape' => ['nullable', 'string', 'max:50'],
            'description' => ['nullable', 'string'],

            'qty' => ['nullable', 'integer', 'min:1'],
            'weight' => ['nullable', 'numeric', 'min:0'],

            'beneficiary_name' => ['nullable', 'string', 'max:255'],

            'purchase_price' => ['nullable', 'numeric', 'min:0'],
            'sell_price' => ['nullable', 'numeric', 'min:0'],
            'sell_date' => ['nullable', 'date'],

            'supplier_name' => ['nullable', 'string', 'max:255'],
            'brand_name' => ['nullable', 'string', 'max:255'],
            'certificate_no' => ['nullable', 'string', 'max:255'],

            'mode_of_transaction' => ['nullable', 'in:cash,bank,cheque'],
            'receipt_no' => ['nullable', 'string', 'max:255'],
            'remarks' => ['nullable', 'string'],

            'attachments.*' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:5120'],
        ]);
    }

    private function storeAttachments(Request $request, array $existing, ?int $entryId = null): array
    {
        $files = $existing;

        if ($request->hasFile('attachments')) {
            foreach ($request->file('attachments') as $file) {
                if (!$file) continue;

                $safeName = Str::random(6) . '_' . preg_replace('/\s+/', '_', $file->getClientOriginalName());
                $dir = $entryId ? "metal-attachments/{$entryId}" : "metal-attachments/tmp";
                $files[] = $file->storeAs($dir, $safeName, 'public');
            }
        }
        return array_values($files);
    }

    public function attachmentsIndex(MetalEntry $metalEntry)
    {
        $files = collect($metalEntry->attachments ?? [])->map(function ($path) {
            $name = basename($path);
            $url = Storage::url($path);
            $ext  = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            $type = in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif']) ? 'image' : 'pdf';

            return [
                'path' => $path,
                'name' => $name,
                'url'  => $url,
                'type' => $type,
            ];
        })->values();

        return response()->json([
            'ok' => true,
            'files' => $files,
        ]);
    }

    public function attachmentsStore(Request $request, MetalEntry $metalEntry)
    {
        $request->validate([
            'attachments'   => ['required', 'array'],
            'attachments.*' => ['file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:25600'], // 25MB
        ]);

        $existing = $metalEntry->attachments ?? [];
        $saved = $existing;

        foreach ($request->file('attachments', []) as $file) {
            if (!$file) continue;

            // keep unique file name
            $safeName = Str::random(6) . '_' . preg_replace('/\s+/', '_', $file->getClientOriginalName());
            $path = $file->storeAs("metal-attachments/{$metalEntry->id}", $safeName, 'public');
            $saved[] = $path;
        }

        $metalEntry->update(['attachments' => array_values($saved)]);

        return response()->json(['ok' => true]);
    }

    public function attachmentsDestroy(Request $request, MetalEntry $metalEntry)
    {
        $request->validate(['path' => ['required', 'string']]);

        $path = $request->path;

        // security: ensure requested path belongs to this row
        if (!in_array($path, $metalEntry->attachments ?? [])) {
            abort(403);
        }

        $files = array_values(array_filter(($metalEntry->attachments ?? []), fn($p) => $p !== $path));

        Storage::disk('public')->delete($path);
        $metalEntry->update(['attachments' => $files]);

        return response()->json(['ok' => true]);
    }

    public function attachmentsDownload(Request $request, MetalEntry $metalEntry)
    {
        $request->validate(['path' => ['required', 'string']]);

        $path = $request->path;

        // security: ensure requested path belongs to this row
        if (!in_array($path, $metalEntry->attachments ?? [])) {
            abort(403);
        }

        $abs = storage_path('app/public/' . $path);
        if (!file_exists($abs)) abort(404);

        return response()->download($abs, basename($path));
    }

    public function attachmentsDownloadAll(MetalEntry $metalEntry)
    {
        $paths = $metalEntry->attachments ?? [];
        if (count($paths) === 0) {
            return back()->with('success', 'No attachments found.');
        }

        $zipName = 'metals_' . $metalEntry->id . '_attachments.zip';
        $tmpZip = storage_path('app/' . $zipName);

        $zip = new ZipArchive();
        if ($zip->open($tmpZip, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            abort(500, 'Cannot create zip');
        }

        foreach ($paths as $path) {
            $abs = storage_path('app/public/' . $path);
            if (file_exists($abs)) {
                $zip->addFile($abs, basename($path));
            }
        }

        $zip->close();

        return response()->download($tmpZip, $zipName)->deleteFileAfterSend(true);
    }
}
