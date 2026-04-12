module.exports = {
  apps: [
    {
      name: "pyzone-backend",
      cwd: "./backend",
      script: "./start-api.sh",
      interpreter: "bash",
      env: {
        PORT: "8000",
      },
    },
  ],
};
