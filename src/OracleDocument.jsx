import { ORACLE_DOCUMENT_SECTIONS } from '../server/src/oracle-document.js'

export default function OracleDocument({ html, documentRef, onSelectText, onNavigate }) {
  return (
    <>
      <nav className="oracle-document-outline" aria-label="技术文档目录">
        <span>目录</span>
        {ORACLE_DOCUMENT_SECTIONS.map((section, index) => (
          <button type="button" key={section.id} onClick={() => onNavigate(section.id)}>
            <i>{String(index + 1).padStart(2, '0')}</i>{section.label}
          </button>
        ))}
      </nav>
      {/* This HTML is a checked-in, read-only server document; user input is never rendered here. */}
      <div
        className="oracle-prose"
        ref={documentRef}
        onMouseUp={onSelectText}
        onKeyUp={onSelectText}
        onTouchEnd={onSelectText}
        aria-label="只读算法技术方案正文"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  )
}
