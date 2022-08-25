import {
  CanonicalView,
  DebugViewer,
  PropertyInfo,
  SunLightConfiguration,
  ViewerEvent
} from '@speckle/viewer'
import { FolderApi, Pane } from 'tweakpane'
import UrlHelper from './UrlHelper'

export default class Sandbox {
  private viewer: DebugViewer
  private pane: Pane
  private tabs
  private viewsFolder!: FolderApi
  private streams: { [url: string]: Array<unknown> } = {}
  private properties: PropertyInfo[]

  public static urlParams = {
    url: 'https://latest.speckle.dev/streams/c43ac05d04/commits/ec724cfbeb'
  }

  public static sceneParams = {
    worldSize: { x: 0, y: 0, z: 0 },
    worldOrigin: { x: 0, y: 0, z: 0 },
    pixelThreshold: 0.5,
    exposure: 0.5,
    tonemapping: 4 //'ACESFilmicToneMapping'
  }

  public static lightParams: SunLightConfiguration = {
    enabled: true,
    castShadow: true,
    intensity: 5,
    color: 0xffffff,
    elevation: 1.33,
    azimuth: 0.75,
    radius: 0,
    indirectLightIntensity: 1.85
  }

  public static filterParams = {
    filterBy: 'Volume'
  }

  public constructor(viewer: DebugViewer) {
    this.viewer = viewer
    this.pane = new Pane({ title: 'Speckle Sandbox', expanded: true })
    this.pane['containerElem_'].style =
      'position:fixed; top: 5px; right: 5px; width: 300px;'

    this.tabs = this.pane.addTab({
      pages: [{ title: 'General' }, { title: 'Scene' }, { title: 'Filtering' }]
    })
    this.properties = []

    viewer.on(ViewerEvent.LoadComplete, (url: string) => {
      this.addStreamControls(url)
      this.addViewControls()
      this.properties = this.viewer.getObjectProperties()
    })
    viewer.on(ViewerEvent.UnloadComplete, (url: string) => {
      this.removeViewControls()
      this.addViewControls()
      this.properties = this.viewer.getObjectProperties()
      url
    })
    viewer.on(ViewerEvent.UnloadAllComplete, (url: string) => {
      this.removeViewControls()
      this.addViewControls()
      this.properties = this.viewer.getObjectProperties()
      url
    })
  }

  public refresh() {
    this.pane.refresh()
  }

  private addStreamControls(url: string) {
    const folder = this.pane.addFolder({
      title: `Object: ${url.split('/').reverse()[0]}`
    })

    folder.addInput({ url }, 'url', {
      title: 'URL',
      disabled: true
    })
    const position = { value: { x: 0, y: 0, z: 0 } }
    folder.addInput(position, 'value', { label: 'Position' }).on('change', () => {
      this.viewer
        .getRenderer()
        .subtree(url)
        .position.set(position.value.x, position.value.y, position.value.z)
      this.viewer.getRenderer().updateDirectLights()
      this.viewer.getRenderer().updateHelpers()
      this.viewer.requestRender()
    })

    folder
      .addButton({
        title: 'Unload'
      })
      .on('click', () => {
        this.removeStreamControls(url)
      })
    this.streams[url] = []
    this.streams[url].push(folder)
  }

  private removeStreamControls(url: string) {
    this.viewer.unloadObject(url)
    ;(this.streams[url][0] as { dispose: () => void }).dispose()
    delete this.streams[url]
  }

  private addViewControls() {
    const views = this.viewer.getViews()
    this.viewsFolder = this.tabs.pages[0].addFolder({
      title: 'Views',
      expanded: true
    })
    for (let k = 0; k < views.length; k++) {
      this.viewsFolder
        .addButton({
          title: views[k].name
        })
        .on('click', () => {
          this.viewer.setView(views[k], true)
        })
    }
  }

  private removeViewControls() {
    this.viewsFolder.dispose()
  }

  public makeGenericUI() {
    this.tabs.pages[0].addInput(Sandbox.urlParams, 'url', {
      title: 'url'
    })

    const loadButton = this.tabs.pages[0].addButton({
      title: 'Load Url'
    })

    loadButton.on('click', () => {
      this.loadUrl(Sandbox.urlParams.url)
    })

    const clearButton = this.tabs.pages[0].addButton({
      title: 'Clear All'
    })

    clearButton.on('click', () => {
      this.viewer.unloadAll()
    })

    this.tabs.pages[0].addSeparator()
    this.tabs.pages[0].addSeparator()

    const toggleSectionBox = this.tabs.pages[0].addButton({
      title: 'Toggle Section Box'
    })
    toggleSectionBox.on('click', () => {
      this.viewer.toggleSectionBox()
    })

    const toggleProjection = this.tabs.pages[0].addButton({
      title: 'Toggle Projection'
    })
    toggleProjection.on('click', () => {
      this.viewer.toggleCameraProjection()
    })

    const zoomExtents = this.tabs.pages[0].addButton({
      title: 'Zoom Extents'
    })
    zoomExtents.on('click', () => {
      this.viewer.zoomExtents(undefined, true)
    })

    this.tabs.pages[0].addSeparator()
    this.tabs.pages[0].addSeparator()

    const showBatches = this.tabs.pages[0].addButton({
      title: 'ShowBatches'
    })
    showBatches.on('click', () => {
      this.viewer.getRenderer().debugShowBatches()
      this.viewer.requestRender()
    })

    const darkModeToggle = this.tabs.pages[0].addButton({
      title: '🌞 / 🌛'
    })
    const dark = localStorage.getItem('dark') === 'dark'
    if (dark) {
      document.getElementById('renderer')?.classList.toggle('background-dark')
    }

    darkModeToggle.on('click', () => {
      const dark = document
        .getElementById('renderer')
        ?.classList.toggle('background-dark')

      localStorage.setItem('dark', dark ? `dark` : `light`)
    })

    const screenshot = this.tabs.pages[0].addButton({
      title: 'Screenshot'
    })
    screenshot.on('click', async () => {
      console.warn(await this.viewer.screenshot())
    })

    const canonicalViewsFolder = this.tabs.pages[0].addFolder({
      title: 'Canonical Views',
      expanded: true
    })
    const sides = ['front', 'back', 'top', 'bottom', 'right', 'left', '3d']
    for (let k = 0; k < sides.length; k++) {
      canonicalViewsFolder
        .addButton({
          title: sides[k]
        })
        .on('click', () => {
          this.viewer.setView(sides[k] as CanonicalView)
        })
    }
  }

  makeSceneUI() {
    const worldFolder = this.tabs.pages[1].addFolder({
      title: 'World',
      expanded: true
    })
    worldFolder.addInput(Sandbox.sceneParams.worldSize, 'x', {
      disabled: true,
      label: 'Size-x',
      step: 0.00000001
    })
    worldFolder.addInput(Sandbox.sceneParams.worldSize, 'y', {
      disabled: true,
      label: 'Size-y',
      step: 0.00000001
    })
    worldFolder.addInput(Sandbox.sceneParams.worldSize, 'z', {
      disabled: true,
      label: 'Size-z',
      step: 0.00000001
    })
    worldFolder.addSeparator()
    worldFolder.addInput(Sandbox.sceneParams.worldOrigin, 'x', {
      disabled: true,
      label: 'Origin-x'
    })
    worldFolder.addInput(Sandbox.sceneParams.worldOrigin, 'y', {
      disabled: true,
      label: 'Origin-y'
    })
    worldFolder.addInput(Sandbox.sceneParams.worldOrigin, 'z', {
      disabled: true,
      label: 'Origin-z'
    })

    this.tabs.pages[1].addSeparator()
    const postFolder = this.tabs.pages[1].addFolder({
      title: 'Post',
      expanded: true
    })

    postFolder
      .addInput(Sandbox.sceneParams, 'exposure', {
        min: 0,
        max: 1
      })
      .on('change', () => {
        this.viewer.getRenderer().renderer.toneMappingExposure =
          Sandbox.sceneParams.exposure
        this.viewer.requestRender()
      })

    postFolder
      .addInput(Sandbox.sceneParams, 'tonemapping', {
        options: {
          Linear: 1,
          ACES: 4
        }
      })
      .on('change', () => {
        this.viewer.getRenderer().renderer.toneMapping = Sandbox.sceneParams.tonemapping
        this.viewer.requestRender()
      })

    const lightsFolder = this.tabs.pages[1].addFolder({
      title: 'Lights',
      expanded: true
    })
    const directLightFolder = lightsFolder.addFolder({
      title: 'Direct',
      expanded: true
    })
    directLightFolder
      .addInput(Sandbox.lightParams, 'enabled', {
        label: 'Sun Enabled'
      })
      .on('change', () => {
        this.viewer.setLightConfiguration(Sandbox.lightParams)
      })
    directLightFolder
      .addInput(Sandbox.lightParams, 'castShadow', {
        label: 'Sun Shadows'
      })
      .on('change', () => {
        this.viewer.setLightConfiguration(Sandbox.lightParams)
      })
    directLightFolder
      .addInput(Sandbox.lightParams, 'intensity', {
        label: 'Sun Intensity',
        min: 0,
        max: 10
      })
      .on('change', () => {
        this.viewer.setLightConfiguration(Sandbox.lightParams)
      })
    directLightFolder
      .addInput(Sandbox.lightParams, 'color', {
        view: 'color',
        label: 'Sun Color'
      })
      .on('change', () => {
        this.viewer.setLightConfiguration(Sandbox.lightParams)
      })
    directLightFolder
      .addInput(Sandbox.lightParams, 'elevation', {
        label: 'Sun Elevation',
        min: 0,
        max: Math.PI
      })
      .on('change', () => {
        this.viewer.setLightConfiguration(Sandbox.lightParams)
      })
    directLightFolder
      .addInput(Sandbox.lightParams, 'azimuth', {
        label: 'Sun Azimuth',
        min: -Math.PI * 0.5,
        max: Math.PI * 0.5
      })
      .on('change', () => {
        this.viewer.setLightConfiguration(Sandbox.lightParams)
      })
    directLightFolder
      .addInput(Sandbox.lightParams, 'radius', {
        label: 'Sun Radius',
        min: 0,
        max: 1000
      })
      .on('change', () => {
        this.viewer.setLightConfiguration(Sandbox.lightParams)
      })

    const indirectLightsFolder = lightsFolder.addFolder({
      title: 'Indirect',
      expanded: true
    })

    indirectLightsFolder
      .addInput(Sandbox.lightParams, 'indirectLightIntensity', {
        label: 'Probe Intensity',
        min: 0,
        max: 10
      })
      .on('change', (value) => {
        value
        this.viewer.setLightConfiguration(Sandbox.lightParams)
      })
  }

  makeFilteringUI() {
    const filteringFolder = this.tabs.pages[2].addFolder({
      title: 'Filtering',
      expanded: true
    })

    filteringFolder.addInput(Sandbox.filterParams, 'filterBy', {
      options: {
        Volume: 'parameters.HOST_VOLUME_COMPUTED.value',
        Area: 'parameters.HOST_AREA_COMPUTED.value',
        SpeckleType: 'speckle_type'
      }
    })

    filteringFolder
      .addButton({
        title: 'Apply Filter'
      })
      .on('click', () => {
        const data = this.properties.find((value) => {
          return value.key === Sandbox.filterParams.filterBy
        }) as PropertyInfo
        this.viewer.setColorFilter(data)
        this.pane.refresh()
      })

    filteringFolder
      .addButton({
        title: 'Clear Filters'
      })
      .on('click', () => {
        this.viewer.resetFilters()
      })
  }

  public async loadUrl(url: string) {
    const objUrls = await UrlHelper.getResourceUrls(url)
    for (const url of objUrls) {
      console.log(`Loading ${url}`)
      const authToken = localStorage.getItem(
        url.includes('latest') ? 'AuthTokenLatest' : 'AuthToken'
      ) as string
      await this.viewer.loadObject(url, authToken)
    }
    localStorage.setItem('last-load-url', url)
  }
}
