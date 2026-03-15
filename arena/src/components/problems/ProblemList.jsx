import styles from "./ProblemList.module.css";

const difficulties = [
  { id: "all", label: "All" },
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];

export default function ProblemList({
  problems,
  loading,
  search,
  difficulty,
  selectedProblemId,
  onSearchChange,
  onDifficultyChange,
  onSelect,
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>Search</div>
        <input
          className={styles.search}
          placeholder="Search problems"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <div className={styles.filters}>
          {difficulties.map((item) => (
            <button
              key={item.id}
              className={`${styles.filter} ${difficulty === item.id ? styles.active : ""}`}
              type="button"
              onClick={() => onDifficultyChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className={styles.meta}>{problems.length} problem</div>
      </div>

      <div className={styles.list}>
        {loading
          ? Array.from({ length: 5 }).map((_, index) => <div key={index} className={styles.skeleton} />)
          : problems.map((problem) => (
              <button
                key={problem.id}
                className={`${styles.card} ${selectedProblemId === problem.id ? styles.selected : ""}`}
                type="button"
                onClick={() => onSelect(problem.id)}
              >
                <div className={styles.cardTitle}>{problem.title || problem.id}</div>
                <div className={styles.cardMeta}>
                  <span className={`${styles.pill} ${styles[(problem.difficulty || "easy").toLowerCase()]}`}>
                    {String(problem.difficulty || "easy").toUpperCase()}
                  </span>
                  <span>{problem.id}</span>
                </div>
              </button>
            ))}
        {!loading && problems.length === 0 ? (
          <div className={styles.empty}>No problems match the current filters.</div>
        ) : null}
      </div>
    </div>
  );
}
