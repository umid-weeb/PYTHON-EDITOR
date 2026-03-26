import UserQuickSearch from "../common/UserQuickSearch.jsx";
import styles from "./DashboardShell.module.css";

export default function DashboardShell({ eyebrow, title, subtitle, actions, children }) {
  const showHeader = Boolean(eyebrow || title || subtitle || actions);

  return (
    <div className={styles.page}>
      {showHeader ? (
        <header className={styles.header}>
          <div className={styles.copy}>
            {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
            {title ? <h1>{title}</h1> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className={styles.side}>
            <div className={styles.search}>
              <UserQuickSearch />
            </div>
            {actions ? <div className={styles.actions}>{actions}</div> : null}
          </div>
        </header>
      ) : null}
      <main className={styles.content}>{children}</main>
    </div>
  );
}
