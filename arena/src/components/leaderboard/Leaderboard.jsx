import { Link } from "react-router-dom";
import styles from "./Leaderboard.module.css";
import Avatar from "../profile/Avatar";

export default function Leaderboard({ entries = [], error }) {
  if (error) {
    return (
      <div className={styles.errorCard}>
        <div className={styles.errorIcon}>!</div>
        <p>{error}</p>
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className={styles.emptyCard}>
        <div className={styles.emptyIllustration}>
          <div className={styles.pulseRing}></div>
          <div className={styles.innerCircle}></div>
        </div>
        <h3>No data yet</h3>
        <p>The leaderboard will be populated as soon as submissions are processed.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.rankCol}>#</th>
                <th className={styles.userCol}>Contestant</th>
                <th className={styles.statCol}>Rating</th>
                <th className={styles.statCol}>Solved</th>
                <th className={styles.statCol}>Total Subs</th>
                <th className={styles.statCol}>Best Time</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => {
                const isTopThree = index < 3;
                const rankClass = isTopThree ? styles[`rank${index + 1}`] : "";
                
                return (
                  <tr key={`${entry.username}-${index}`} className={styles.row}>
                    <td className={styles.rankCell}>
                      <span className={`${styles.rankBadge} ${rankClass}`}>
                        {index + 1}
                      </span>
                    </td>
                    <td className={styles.userCell}>
                      <Link to={`/profile/${encodeURIComponent(entry.username)}`} className={styles.userLink}>
                        <div className={styles.userInfo}>
                          <Avatar
                            username={entry.username}
                            src={entry.avatar_url}
                            size="sm"
                            className={styles.userAvatar}
                          />
                          <div className={styles.userNameGroup}>
                            <span className={styles.username}>{entry.username}</span>
                            {entry.display_name && (
                              <span className={styles.displayName}>{entry.display_name}</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className={styles.statCell}>
                      <div className={styles.ratingBadge}>
                        {entry.rating ?? 1200}
                      </div>
                    </td>
                    <td className={styles.statCell}>
                      <span className={styles.solvedCount}>
                        {entry.solved_count ?? entry.solved ?? 0}
                      </span>
                    </td>
                    <td className={styles.statCell}>
                      <span className={styles.mutedText}>{entry.submissions || 0}</span>
                    </td>
                    <td className={styles.statCell}>
                      <span className={styles.fastestTime}>
                        {entry.fastest_ms ? `${entry.fastest_ms}ms` : "--"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
