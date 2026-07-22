// Portable build script: produces release/win-unpacked/ that can run without installer
import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

async function main() {
  const release = join(root, 'release', 'win-unpacked')
  await fs.rm(release, { recursive: true, force: true })
  await fs.mkdir(join(release, 'resources'), { recursive: true })

  // Copy built output
  await fs.cp(join(root, 'out'), join(release, 'resources', 'app'), { recursive: true })
  // Copy Electron binary
  await fs.cp(join(root, 'node_modules', 'electron', 'dist'), join(release, 'electron'), { recursive: true })
  // Copy package.json (Electron reads it for "main" field)
  await fs.copyFile(join(root, 'package.json'), join(release, 'package.json'))
  // Create launcher batch
  const bat = '@echo off\r\ncd /d "%~dp0"\r\nstart "" "electron\\electron.exe" "resources\\app"\r\n'
  await fs.writeFile(join(release, 'Token Consumption.bat'), bat, 'utf-8')

  console.log(`✓ Built: ${release}`)
  console.log(`  Run:   ${join(release, 'electron', 'electron.exe')}`)
  console.log(`  Or:    ${join(release, 'Token Consumption.bat')}`)
}

main().catch(e => { console.error(e); process.exit(1) })
