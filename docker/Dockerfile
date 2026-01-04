FROM debian:bookworm-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    git \
    vim \
    bash \
    nodejs \
    npm \
    build-essential \
    python3 \
    python3-pip \
    sudo \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for Claude Code
RUN useradd -m -s /bin/bash -u 1000 claude && \
    echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Create workspace directory
WORKDIR /workspace

# Create .claude directory structure for the claude user
RUN mkdir -p /home/claude/.claude /home/claude/.local/bin && \
    chown -R claude:claude /home/claude

# Create initial shell configuration files
RUN touch /home/claude/.bashrc /home/claude/.profile && \
    chown claude:claude /home/claude/.bashrc /home/claude/.profile && \
    chmod 644 /home/claude/.bashrc /home/claude/.profile

# Set up environment (MUST be before Claude installation)
ENV PATH="/home/claude/.local/bin:${PATH}"
ENV HOME="/home/claude"

# Install Claude Code as the claude user
USER claude
RUN curl -fsSL https://claude.ai/install.sh | bash && \
    claude --version

# Switch back to root for entrypoint setup
USER root

# Copy entrypoint script
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/bin/bash"]
