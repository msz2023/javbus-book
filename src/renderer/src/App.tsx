import { DetailDrawer } from './components/DetailDrawer'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { BrowsePage } from './pages/BrowsePage'
import { DownloadsPage } from './pages/DownloadsPage'
import { GenresPage } from './pages/GenresPage'
import { LocalPage } from './pages/LocalPage'
import { SettingsPage } from './pages/SettingsPage'
import { useApp } from './state'

export function App(): JSX.Element {
  const { view } = useApp()

  return (
    <div className="flex h-full w-full overflow-hidden bg-ink-900">
      <Sidebar />
      {view.kind === 'browse' && <BrowsePage key={JSON.stringify(view.query)} query={view.query} />}
      {view.kind === 'genres' && <GenresPage />}
      {view.kind === 'local' && <LocalPage preset={view.preset} />}
      {view.kind === 'downloads' && <DownloadsPage />}
      {view.kind === 'settings' && <SettingsPage />}
      <DetailDrawer />
      <Toasts />
    </div>
  )
}
