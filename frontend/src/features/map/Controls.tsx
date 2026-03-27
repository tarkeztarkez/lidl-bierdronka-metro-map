import type { LayerVisibility } from './types'

interface ControlsProps {
  storeMinutes: number
  metroMinutes: number
  milkbarMinutes: number
  showMilkbars: boolean
  onStoreMinutesChange: (value: number) => void
  onMetroMinutesChange: (value: number) => void
  onMilkbarMinutesChange: (value: number) => void
  onShowMilkbarsChange: (value: boolean) => void
  layerVisibility: LayerVisibility
  onLayerVisibilityChange: (value: LayerVisibility) => void
  errorMessage: string | null
  metadataMessage: string | null
  overlayMessage: string | null
  routeDate: string
  routeTime: string
  onRouteDateChange: (value: string) => void
  onRouteTimeChange: (value: string) => void
  isRoutesLoading: boolean
  routeMessage: string | null
}

function LayerToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="layer-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

function SliderRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="slider-card">
      <div className="slider-head">
        <div>
          <span className="slider-label">{label}</span>
          <p className="slider-description">{description}</p>
        </div>
        <strong className="slider-value">{value} min</strong>
      </div>
      <input
        aria-label={label}
        className="slider"
        min={1}
        max={30}
        step={1}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <div className="slider-scale" aria-hidden="true">
        <span>1</span>
        <span>15</span>
        <span>30</span>
      </div>
    </label>
  )
}

function RouteTimeCard({
  date,
  time,
  onDateChange,
  onTimeChange,
  isRoutesLoading,
  routeMessage,
}: {
  date: string
  time: string
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
  isRoutesLoading: boolean
  routeMessage: string | null
}) {
  return (
    <div className="slider-card">
      <div className="slider-head">
        <div>
          <span className="slider-label">Transit departure</span>
          <p className="slider-description">
            Used for public transport when a map point is selected.
          </p>
        </div>
        <strong className="slider-value">{isRoutesLoading ? 'Syncing' : 'Ready'}</strong>
      </div>
      <div className="route-time-grid">
        <label className="route-time-field">
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.currentTarget.value)}
          />
        </label>
        <label className="route-time-field">
          <span>Time</span>
          <input
            type="time"
            value={time}
            onChange={(event) => onTimeChange(event.currentTarget.value)}
          />
        </label>
      </div>
      {routeMessage ? <p className="slider-description">{routeMessage}</p> : null}
    </div>
  )
}

export function Controls({
  storeMinutes,
  metroMinutes,
  milkbarMinutes,
  showMilkbars,
  onStoreMinutesChange,
  onMetroMinutesChange,
  onMilkbarMinutesChange,
  onShowMilkbarsChange,
  layerVisibility,
  onLayerVisibilityChange,
  errorMessage,
  metadataMessage,
  overlayMessage,
  routeDate,
  routeTime,
  onRouteDateChange,
  onRouteTimeChange,
  isRoutesLoading,
  routeMessage,
}: ControlsProps) {
  return (
    <section className="controls-stack controls-stack-compact" aria-label="Walking time controls">
      <SliderRow
        label="Lidl / Biedronka reach"
        description="Nearest grocery"
        value={storeMinutes}
        onChange={onStoreMinutesChange}
      />
      <SliderRow
        label="Metro reach"
        description="Nearest metro"
        value={metroMinutes}
        onChange={onMetroMinutesChange}
      />
      {showMilkbars ? (
        <SliderRow
          label="Milkbar reach"
          description="Nearest milkbar"
          value={milkbarMinutes}
          onChange={onMilkbarMinutesChange}
        />
      ) : null}
      <div className="toggle-card toggle-card-single" role="group" aria-label="Milkbar layer">
        <button
          className={`toggle-button ${showMilkbars ? 'toggle-button-active' : ''}`}
          type="button"
          onClick={() => onShowMilkbarsChange(!showMilkbars)}
        >
          {showMilkbars ? 'Milkbars on' : 'Milkbars off'}
        </button>
      </div>

      <RouteTimeCard
        date={routeDate}
        time={routeTime}
        onDateChange={onRouteDateChange}
        onTimeChange={onRouteTimeChange}
        isRoutesLoading={isRoutesLoading}
        routeMessage={routeMessage}
      />

      <div className="controls-footer">
        <div className="layer-toggle-card" role="group" aria-label="Layer visibility">
          <LayerToggleRow
            label="Store"
            checked={layerVisibility.store}
            onChange={(value) => onLayerVisibilityChange({ ...layerVisibility, store: value })}
          />
          <LayerToggleRow
            label="Metro"
            checked={layerVisibility.metro}
            onChange={(value) => onLayerVisibilityChange({ ...layerVisibility, metro: value })}
          />
          <LayerToggleRow
            label="Intersection"
            checked={layerVisibility.intersection}
            onChange={(value) => onLayerVisibilityChange({ ...layerVisibility, intersection: value })}
          />
          {showMilkbars ? (
            <LayerToggleRow
              label="Milkbar"
              checked={layerVisibility.milkbar}
              onChange={(value) => onLayerVisibilityChange({ ...layerVisibility, milkbar: value })}
            />
          ) : null}
        </div>

        <div className="message-stack" aria-live="polite">
          {metadataMessage ? <p>{metadataMessage}</p> : null}
          {overlayMessage ? <p>{overlayMessage}</p> : null}
          {errorMessage ? <p className="message-error">{errorMessage}</p> : null}
        </div>
      </div>
    </section>
  )
}
