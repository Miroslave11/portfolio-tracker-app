import { useEffect, useState } from 'react'
import { Card } from './Card'
import { UpdateSettings } from './UpdateSettings'

const REPO = 'https://github.com/Miroslave11/portfolio-tracker-app'

/** Nastavení → Aplikace: verze a automatické aktualizace, odkaz na projekt. */
export function AboutCard(): React.JSX.Element {
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.api.getAppVersion().then(setVersion)
  }, [])

  return (
    <>
      <Card title="Aktualizace aplikace">
        <UpdateSettings />
      </Card>
      <Card title="O aplikaci">
        <p className="text-[13px]">
          Portfolio Tracker – sledování dlouhodobého ETF portfolia. Zdrojový kód, vydání a hlášení
          chyb jsou na{' '}
          <a href={REPO} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            GitHubu
          </a>
          .{' '}
          {version && (
            <>
              <a
                href={`${REPO}/releases/tag/v${version}`}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                Seznam změn verze {version}
              </a>
              .
            </>
          )}
        </p>
        <p className="mt-3 text-xs text-muted">
          Aplikace není digitálně podepsaná, takže ji Windows (SmartScreen) a některé antiviry mohou
          označit jako neznámou. Aktualizace se ověřují kontrolním součtem z vydání. Nejde o
          finanční poradenství.
        </p>
      </Card>
    </>
  )
}
