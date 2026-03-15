import styles from "./AppFrame.module.css";

export default function AppFrame({ children }) {
  return (
    <div className={styles.frame}>
      <div className={styles.glowOne} />
      <div className={styles.glowTwo} />
      <div className={styles.grid} />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
