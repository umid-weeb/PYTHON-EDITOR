import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import UserQuickSearch from "../common/UserQuickSearch.jsx";
import styles from "./ArenaLayout.module.css";

export default function ArenaLayout({
  sidebar,
  viewer,
  editor,
  testCases,
  result,
  authModal,
}) {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <div className={styles.brand}>
          <button className={styles.editorLink} type="button" onClick={() => navigate("/")}>
            Editor
          </button>
          <div>
            <div className={styles.title}>Zone</div>
            <div className={styles.subtitle}>Competitive coding workspace</div>
          </div>
        </div>
        <div className={styles.headerTools}>
          <UserQuickSearch />
          <div className={styles.account}>
            <button className={styles.avatar} type="button" onClick={() => navigate("/profile")}>
              {(user?.username || "U").slice(0, 1).toUpperCase()}
            </button>
            <button className={styles.accountLink} type="button" onClick={() => navigate("/leaderboard")}>
              Rating
            </button>
            <button className={styles.accountLink} type="button" onClick={async () => {
              await logout();
              navigate("/login");
            }}>
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        <aside className={styles.sidebar}>{sidebar}</aside>
        <section className={styles.viewer}>{viewer}</section>
        <section className={styles.editor}>{editor}</section>
        <section className={styles.testCases}>{testCases}</section>
        <section className={styles.result}>{result}</section>
      </div>

      {authModal}
    </div>
  );
}
