import {
  computed,
  effect,
  EffectRef,
  Injectable,
  Injector,
  OnDestroy,
  Signal,
  signal,
  WritableSignal
} from "@angular/core";
import {Subject} from "rxjs";
import {CdsHooksServiceConfig, CustomSort, PathSort, SortingConfig} from "./cds-hooks.service";

declare type ValueState<T> = {[conceptId: string]: { value: WritableSignal<any>, resources: T[] }}

@Injectable()
export abstract class CdsStore<T extends { resourceType: string, id?: string }> implements OnDestroy {
  private readonly valueState = {} as ValueState<T>
  private onDestroy$ = new Subject<void>();
  private sorting: SortingConfig<T>|undefined = this.config.sort;
  private effects: EffectRef[] = [];

  constructor(protected config: CdsHooksServiceConfig<T>) {
    console.log('instance created')
  }

  public hasConcept(conceptId: string): boolean {
    return !!this.valueState[conceptId];
  }

  public addConcept(conceptId: string, initialValue: any, resources: T[]) {
    if (this.valueState[conceptId]) {
      throw new Error(`${conceptId} is already exists in the state.` +
        'Use CdsHooksService.updateValue to change its state.', {
        cause: 'CdsHooksService.addConcept'
      })
    }
    this.valueState[conceptId] = { value: signal(initialValue), resources: resources }
    return this.valueState[conceptId].value.asReadonly()
  }

  public setValue(conceptId: string, value: any) {
    this.valueState[conceptId].value.set(value)
  }

  public updateValue(conceptId: string, updater: (currentValue: any) => any) {
    this.valueState[conceptId].value.update(current => {
      const newValue = updater(current)
      return Array.isArray(current) ? [...newValue] : (typeof current === 'object' ? {...newValue} : newValue)
    })
  }

  public getValue<V = any>(conceptId: string): Signal<V> {
    return this.valueState[conceptId].value.asReadonly()
  }

  public getResources<R extends T>(conceptId: string): R[] {
    return <R[]>this.valueState[conceptId].resources;
  }

  public getComputed(argConceptIds: string[], computation: (args: any) => any) {
    return computed(() => computation(argConceptIds.reduce(
      (obj: { [conceptId: string]: any }, arg) => {
        obj[arg] = this.valueState[arg].value();
        return obj;
      }, {})
    ))
  }

  public getCurrentState(conceptIds: string[]) {
    return conceptIds.reduce(
      (obj: { [conceptId: string]: any }, arg) => {
        if (this.valueState[arg]) {
          obj[arg] = { value: this.valueState[arg].value(), resources: (<T[]>[]).concat(this.valueState[arg].resources) };
        }
        return obj;
      }, {})
  }

  public onChange(conceptIds: string[], callback: (args: { [conceptId: string]: any }) => any, injector: Injector, takeUntil?: Subject<void>) {
    const effectRef = effect(() => {
      const args = this.getCurrentState(conceptIds)
      callback(args)
    }, { injector });
    this.effects.push(effectRef)
    takeUntil?.asObservable().subscribe(() => {
      this.effects = this.effects.filter(e => e !== effectRef)
      effectRef.destroy();
    })
  }

  ngOnDestroy(): void {
    this.effects.forEach(effect => { try { effect.destroy() } catch (err) {} })
    this.effects = []
    this.onDestroy$.next()
    this.onDestroy$.complete()
  }

  private sort(resources: T[]) {
    if (!this.sorting) {
      return resources;
    } else if ((<CustomSort<T>>this.sorting).custom) {
      const conf = <CustomSort<T>>this.config.sort
      return resources.sort(conf.custom)
    } else {
      const conf = <PathSort<T>>this.config.sort
      return resources.sort((a: T, b: T) => {
        if (!conf.paths[a.resourceType] || !conf.paths[b.resourceType]) {
          return 0;
        }
        const pathA = Array.isArray(conf.paths[a.resourceType]) ? (<string[]>conf.paths[a.resourceType]) : [<string>conf.paths[a.resourceType]];
        const pathB = Array.isArray(conf.paths[b.resourceType]) ? (<string[]>conf.paths[b.resourceType]) : [<string>conf.paths[b.resourceType]];
        const valueA = pathA.map(path => conf.pathEvaluator(a, path, ...(conf.evaluatorArgs || []))).find(value => value != undefined)
        const valueB = pathB.map(path => conf.pathEvaluator(a, path, ...(conf.evaluatorArgs || []))).find(value => value != undefined)
        return (valueA > valueB) ? (conf.ascending ? 1 : -1) : (conf.ascending ? -1 : 1);
      })
    }
  }

  findLatest(resources: T[]) {
    return this.sort(resources || [])[0]
  }

}
