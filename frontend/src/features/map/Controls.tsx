import type { ApiMetadata, OverlayDisplayMode } from './types'

interface ControlsProps {
  storeMinutes: number
  metroMinutes: number
  milkbarMinutes: number
  showMilkbars: boolean
  onStoreMinutesChange: (value: number) => void
  onMetroMinutesChange: (value: number) => void
  onMilkbarMinutesChange: (value: number) => void
  onShowMilkbarsChange: (value: boolean) => void
  metadata: ApiMetadata
  overlayDisplayMode: OverlayDisplayMode
  onOverlayDisplayModeChange: (value: OverlayDisplayMode) => void
  isMetadataLoading: boolean
  isOverlayLoading: boolean
  status: 'loading' | 'live' | 'demo' | 'error'
  errorMessage: string | null
  metadataMessage: string | null
  overlayMessage: string | null
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

export function Controls({
  storeMinutes,
  metroMinutes,
  milkbarMinutes,
  showMilkbars,
  onStoreMinutesChange,
  onMetroMinutesChange,
  onMilkbarMinutesChange,
  onShowMilkbarsChange,
  metadata,
  overlayDisplayMode,
  onOverlayDisplayModeChange,
  isMetadataLoading,
  isOverlayLoading,
  status,
  errorMessage,
  metadataMessage,
  overlayMessage,
}: ControlsProps) {
  return (
    <section className="controls-stack" aria-label="Walking time controls">
      <SliderRow
        label="Lidl / Biedronka reach"
        description="Walking time to the nearest grocery store."
        value={storeMinutes}
        onChange={onStoreMinutesChange}
      />
      <SliderRow
        label="Metro reach"
        description="Walking time to the nearest Warsaw metro station."
        value={metroMinutes}
        onChange={onMetroMinutesChange}
      />
      {showMilkbars ? (
        <SliderRow
          label="Milkbar reach"
          description="Walking time to the nearest milkbar."
          value={milkbarMinutes}
          onChange={onMilkbarMinutesChange}
        />
      ) : null}
      <div className="toggle-card" role="group" aria-label="Milkbar layer">
        <button
          className={`toggle-button ${showMilkbars ? 'toggle-button-active' : ''}`}
          type="button"
          onClick={() => onShowMilkbarsChange(!showMilkbars)}
        >
          {showMilkbars ? 'Milkbars on' : 'Milkbars off'}
        </button>
      </div>

      <div className="controls-footer">
        <div className={`mode-chip mode-${status}`}>
          {isOverlayLoading ? 'Updating overlay' : status}
        </div>
        <div className="toggle-card" role="group" aria-label="Overlay display mode">
          <button
            className={`toggle-button ${overlayDisplayMode === 'full' ? 'toggle-button-active' : ''}`}
            type="button"
            onClick={() => onOverlayDisplayModeChange('full')}
          >
            Full layers
          </button>
          <button
            className={`toggle-button ${overlayDisplayMode === 'intersection' ? 'toggle-button-active' : ''}`}
            type="button"
            onClick={() => onOverlayDisplayModeChange('intersection')}
          >
            Intersections only
          </button>
        </div>
        <div className="metadata-list">
          <div>
            <span>Store range</span>
            <strong>
              {metadata.storeMinutesRange?.[0] ?? 1}-
              {metadata.storeMinutesRange?.[1] ?? 30}
            </strong>
          </div>
          <div>
            <span>Metro range</span>
            <strong>
              {metadata.metroMinutesRange?.[0] ?? 1}-
              {metadata.metroMinutesRange?.[1] ?? 30}
            </strong>
          </div>
          <div>
            <span>Metadata</span>
            <strong>{isMetadataLoading ? 'Loading' : metadata.source ?? 'API'}</strong>
          </div>
          {showMilkbars ? (
            <div>
              <span>Milkbar range</span>
              <strong>
                {metadata.milkbarMinutesRange?.[0] ?? 1}-
                {metadata.milkbarMinutesRange?.[1] ?? 30}
              </strong>
            </div>
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
