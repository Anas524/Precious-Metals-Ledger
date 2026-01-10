<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\MetalEntryController;

Route::get('/metals', [MetalEntryController::class, 'index'])->name('metals.index');
Route::post('/metals', [MetalEntryController::class, 'store'])->name('metals.store');
Route::put('/metals/{metalEntry}', [MetalEntryController::class, 'update'])->name('metals.update');
Route::delete('/metals/{metalEntry}', [MetalEntryController::class, 'destroy'])->name('metals.destroy');

// Attachments (Metals Ledger)
Route::get('/metals/{metalEntry}/attachments', [MetalEntryController::class, 'attachmentsIndex'])
  ->name('metals.attachments.index');

Route::post('/metals/{metalEntry}/attachments', [MetalEntryController::class, 'attachmentsStore'])
  ->name('metals.attachments.store');

Route::delete('/metals/{metalEntry}/attachments', [MetalEntryController::class, 'attachmentsDestroy'])
  ->name('metals.attachments.destroy');

Route::get('/metals/{metalEntry}/attachments/download', [MetalEntryController::class, 'attachmentsDownload'])
  ->name('metals.attachments.download');

Route::get('/metals/{metalEntry}/attachments/download-all', [MetalEntryController::class, 'attachmentsDownloadAll'])
  ->name('metals.attachments.downloadAll');
