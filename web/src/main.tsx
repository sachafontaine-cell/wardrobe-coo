import { render } from 'preact'
import './styles.css'
import { App, refreshDay } from './app'
import { hydrate } from './store'
import { startUpdates } from './update'

// Data is read synchronously from local storage, so the first frame already shows today's outfit.
refreshDay()
render(<App />, document.getElementById('app')!)
hydrate().then(() => refreshDay())
startUpdates()
