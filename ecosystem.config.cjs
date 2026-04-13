module.exports = {
  apps: [
    {
      name: "pyzone-backend",
      cwd: "./backend",
      script: "./start-api.sh",
      interpreter: "bash",
      env: {
        PORT: "8000",
        PYZONE_REQUIRE_DATABASE_URL: "1",
        ARENA_JUDGE_USE_DOCKER: "true",
        ARENA_JUDGE_DOCKER_IMAGE: "python:3.11-slim",
        ARENA_JUDGE_CPU_LIMIT: "0.5",
        ARENA_JUDGE_PIDS_LIMIT: "32",
      },
    },
  ],
};
