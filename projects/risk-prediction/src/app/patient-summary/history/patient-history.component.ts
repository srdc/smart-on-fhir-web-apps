import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';

import { HistoryBuilderService } from './history-builder.service';
import { HistoryEvent, HistorySettings, defaultHistorySettings } from './history.types';
import { ICON_MAP } from './vocab.history';

@Component({
  selector: 'rp-patient-history',
  templateUrl: './patient-history.component.html',
  styleUrls: ['./patient-history.component.scss']
})
export class PatientHistoryComponent implements OnInit, OnDestroy, OnChanges {

  @Input() patientId?: string;
  /** Undefined uses normal SMART/FHIR loading; an array is an immutable frozen Study timeline. */
  @Input() frozenEvents?: HistoryEvent[];

  events: HistoryEvent[] = [];
  filtered: HistoryEvent[] = [];

  settings: HistorySettings = defaultHistorySettings();
  settingsOpen = false;

  loading = false;              // prevents empty-state flash
  private sub?: Subscription;

  constructor(private historyBuilder: HistoryBuilderService) {}

  getIconClass(iconKey: string): string {
    return ICON_MAP[iconKey] || 'bi-circle'; // Fallback to a circle if key is missing
  }

  ngOnInit(): void {
    this.loadSettings();
    if (this.frozenEvents !== undefined) {
      this.useFrozenEvents(this.frozenEvents);
    } else if (this.patientId) {
      this.loadEvents();  // handle already-set input
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['frozenEvents'] && this.frozenEvents !== undefined) {
      this.useFrozenEvents(this.frozenEvents);
    } else if (changes['patientId'] && this.patientId && this.frozenEvents === undefined) {
      this.loadEvents();                    // reload when input arrives/changes
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  openSettings(): void { this.settingsOpen = true; }
  closeSettings(): void { this.settingsOpen = false; }

  onSettingsSave(next: HistorySettings): void {
    this.settings = next;
    this.saveSettings();
    this.applySettings();
    this.closeSettings();
  }

  private loadEvents(): void {
    this.loading = true;
    this.sub?.unsubscribe();

    this.sub = this.historyBuilder.getHistoryEvents(this.patientId).subscribe({
      next: (events) => {
        this.events = events ?? [];

        // Initialize medication visibility defaults
        this.initializeMedSettings();

        this.applySettings();
        this.loading = false;
      },
      error: (err) => {
        this.events = [];
        this.filtered = [];
        this.loading = false;
      }
    });
  }

  private useFrozenEvents(events: HistoryEvent[]): void {
    this.sub?.unsubscribe();
    this.events = events;
    this.initializeMedSettings();
    this.applySettings();
    this.loading = false;
  }

  /**
   * Scans the found medications and sets up default visibility:
   * - Top 5 unique meds -> visible (true)
   * - Rest of meds -> hidden (false)
   * - Preserves user choices if they already saved settings previously.
   */
  private initializeMedSettings(): void {
    const meds = this.events.filter(e => e.kind === 'medication');
    if (!meds.length) return;

    // 1. Get unique list of drug names found for this patient
    // (meds are already sorted by date in builder, but let's be safe)
    const uniqueDrugNames = Array.from(new Set(meds.map(m => m.title)));

    // 2. Check if we have existing saved settings
    const savedVisibility = this.settings.meds.visibility || {};
    const isFirstLoad = Object.keys(savedVisibility).length === 0;

    if (isFirstLoad) {
      // Logic: Select first 5 unique drugs as default
      uniqueDrugNames.forEach((name, index) => {
        this.settings.meds.visibility[name] = index < 5;
      });
      // Save these defaults so they persist
      this.saveSettings();
    } else {
      // If we have saved settings, ensure any *newly* discovered meds
      // are added to the map (defaulting to false to not disrupt view)
      uniqueDrugNames.forEach(name => {
        if (savedVisibility[name] === undefined) {
          this.settings.meds.visibility[name] = false;
        }
      });
    }
  }

  private applySettings(): void {
    this.filtered = this.events.filter(e => {
      // Conditions
      if (e.kind === 'condition') {
        return this.settings.conditions[e.subtype as keyof typeof this.settings.conditions] ?? true;
      }
      // Lifestyle
      if (e.kind === 'lifestyle' || e.kind === 'derived') {
        return (this.settings.lifestyle as any)[e.subtype] ?? true;
      }

      // Medications (New Logic)
      if (e.kind === 'medication') {
        // Only show if the setting for this specific drug title is explicitly true
        return this.settings.meds.visibility?.[e.title] === true;
      }

      return true;
    });
  }

  private storageKey(): string {
    return `patient-history-settings:${this.patientId ?? 'unknown'}`;
  }

  private loadSettings(): void {
    const raw = localStorage.getItem(this.storageKey());
    this.settings = raw ? JSON.parse(raw) : defaultHistorySettings();

    // Ensure structure exists (migration for old saves)
    if (!this.settings.meds) {
      this.settings.meds = { visibility: {} } as any;
    }
    if (!this.settings.meds.visibility) {
      this.settings.meds.visibility = {};
    }
  }

  private saveSettings(): void {
    localStorage.setItem(this.storageKey(), JSON.stringify(this.settings));
  }
}
