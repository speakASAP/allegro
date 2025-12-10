#!/bin/bash
# SSH Tunnel Setup Script for Local Development
# This script sets up SSH tunnels to production services for local development

set -e

SSH_HOST="statex"
TUNNELS_DIR="/tmp/allegro-tunnels"

# Tunnel configurations: name|local_port|remote_host|remote_port|display_name
TUNNELS=(
  "db|5432|127.0.0.1|5432|database"
  "auth|3371|127.0.0.1|3371|auth-service"
  "logging|3367|127.0.0.1|3367|logging-service"
  "notifications|3368|127.0.0.1|3368|notifications-service"
)

# Create tunnels directory
mkdir -p "$TUNNELS_DIR"

# Function to get tunnel config
get_tunnel_config() {
  local tunnel_name=$1
  for tunnel in "${TUNNELS[@]}"; do
    IFS='|' read -r name local_port remote_host remote_port display_name <<< "$tunnel"
    if [ "$name" = "$tunnel_name" ]; then
      echo "$local_port|$remote_host|$remote_port|$display_name"
      return 0
    fi
  done
  return 1
}

# Function to get tunnel PID file
get_pid_file() {
  local tunnel_name=$1
  echo "$TUNNELS_DIR/${tunnel_name}.pid"
}

# Function to check if tunnel is running
check_tunnel() {
  local tunnel_name=$1
  local pid_file=$(get_pid_file "$tunnel_name")
  
  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    if ps -p "$pid" > /dev/null 2>&1; then
      return 0
    else
      rm -f "$pid_file"
    fi
  fi
  return 1
}

# Function to start a single tunnel
start_single_tunnel() {
  local tunnel_name=$1
  local config=$(get_tunnel_config "$tunnel_name")
  
  if [ -z "$config" ]; then
    echo "❌ Unknown tunnel: $tunnel_name"
    return 1
  fi
  
  IFS='|' read -r local_port remote_host remote_port display_name <<< "$config"
  
  if check_tunnel "$tunnel_name"; then
    local pid=$(cat $(get_pid_file "$tunnel_name"))
    echo "✅ $display_name tunnel is already running (PID: $pid)"
    return 0
  fi
  
  echo "🔌 Starting SSH tunnel for $display_name..."
  echo "   Local: localhost:$local_port -> Remote: $SSH_HOST:$remote_host:$remote_port"
  
  # Start SSH tunnel in background
  ssh -f -N -L ${local_port}:${remote_host}:${remote_port} "$SSH_HOST" 2>&1
  
  # Get the PID of the SSH process
  local ssh_pid=$(pgrep -f "ssh.*-L.*${local_port}:${remote_host}:${remote_port}.*${SSH_HOST}" | head -1)
  
  if [ -n "$ssh_pid" ]; then
    echo "$ssh_pid" > "$(get_pid_file "$tunnel_name")"
    echo "✅ $display_name tunnel started successfully (PID: $ssh_pid)"
    return 0
  else
    echo "❌ Failed to start $display_name tunnel"
    return 1
  fi
}

# Function to stop a single tunnel
stop_single_tunnel() {
  local tunnel_name=$1
  local config=$(get_tunnel_config "$tunnel_name")
  local pid_file=$(get_pid_file "$tunnel_name")
  
  if [ -z "$config" ]; then
    echo "❌ Unknown tunnel: $tunnel_name"
    return 1
  fi
  
  IFS='|' read -r local_port remote_host remote_port display_name <<< "$config"
  
  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    if ps -p "$pid" > /dev/null 2>&1; then
      echo "🛑 Stopping $display_name tunnel (PID: $pid)..."
      kill "$pid" 2>/dev/null || true
      rm -f "$pid_file"
      echo "✅ $display_name tunnel stopped"
      return 0
    else
      rm -f "$pid_file"
    fi
  fi
  
  # Try to find and kill by pattern
  local pids=$(pgrep -f "ssh.*-L.*${local_port}:${remote_host}:${remote_port}.*${SSH_HOST}" || true)
  if [ -n "$pids" ]; then
    echo "   Found tunnel processes: $pids"
    echo "$pids" | xargs kill 2>/dev/null || true
    echo "✅ Stopped $display_name tunnel processes"
    return 0
  fi
  
  echo "ℹ️  $display_name tunnel is not running"
  return 0
}

# Function to start all tunnels
start_all_tunnels() {
  echo "🚀 Starting all SSH tunnels to production services..."
  echo ""
  
  local failed=0
  for tunnel in "${TUNNELS[@]}"; do
    IFS='|' read -r name local_port remote_host remote_port display_name <<< "$tunnel"
    if ! start_single_tunnel "$name"; then
      failed=$((failed + 1))
    fi
    echo ""
  done
  
  if [ $failed -eq 0 ]; then
    echo "✅ All tunnels started successfully!"
    return 0
  else
    echo "⚠️  Some tunnels failed to start ($failed failed)"
    return 1
  fi
}

# Function to stop all tunnels
stop_all_tunnels() {
  echo "🛑 Stopping all SSH tunnels..."
  echo ""
  
  for tunnel in "${TUNNELS[@]}"; do
    IFS='|' read -r name local_port remote_host remote_port display_name <<< "$tunnel"
    stop_single_tunnel "$name"
    echo ""
  done
  
  # Clean up directory if empty
  if [ -z "$(ls -A "$TUNNELS_DIR" 2>/dev/null)" ]; then
    rmdir "$TUNNELS_DIR" 2>/dev/null || true
  fi
  
  echo "✅ All tunnels stopped"
}

# Function to show status of all tunnels
show_status() {
  echo "📊 SSH Tunnel Status:"
  echo ""
  
  local running=0
  local stopped=0
  
  for tunnel in "${TUNNELS[@]}"; do
    IFS='|' read -r name local_port remote_host remote_port display_name <<< "$tunnel"
    
    if check_tunnel "$name"; then
      local pid=$(cat $(get_pid_file "$name"))
      echo "  ✅ $display_name: Running (PID: $pid, Port: $local_port)"
      running=$((running + 1))
    else
      echo "  ❌ $display_name: Stopped (Port: $local_port)"
      stopped=$((stopped + 1))
    fi
  done
  
  echo ""
  echo "Summary: $running running, $stopped stopped"
  
  if [ $running -eq 0 ]; then
    return 1
  fi
  return 0
}

# Function to test connections
test_connections() {
  echo "🧪 Testing service connections..."
  echo ""
  
  local failed=0
  
  # Test database
  local db_config=$(get_tunnel_config "db")
  if [ -n "$db_config" ]; then
    IFS='|' read -r local_port remote_host remote_port display_name <<< "$db_config"
    if check_tunnel "db"; then
      if [ -f .env ]; then
        export $(cat .env | grep -v '^#' | grep -E '^(DB_|DATABASE_URL)' | xargs)
      fi
      
      if command -v psql > /dev/null 2>&1; then
        DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
        if psql "$DB_URL" -c "SELECT 1;" > /dev/null 2>&1; then
          echo "  ✅ Database: Connection successful"
        else
          echo "  ❌ Database: Connection failed"
          failed=$((failed + 1))
        fi
      else
        echo "  ⚠️  Database: psql not found, skipping test"
      fi
    else
      echo "  ❌ Database: Tunnel not running"
      failed=$((failed + 1))
    fi
  fi
  
  # Test auth service
  local auth_config=$(get_tunnel_config "auth")
  if [ -n "$auth_config" ]; then
    IFS='|' read -r local_port remote_host remote_port display_name <<< "$auth_config"
    if check_tunnel "auth"; then
      if curl -s -f -o /dev/null -w "%{http_code}" http://localhost:$local_port/health > /dev/null 2>&1; then
        echo "  ✅ Auth Service: Connection successful"
      else
        echo "  ❌ Auth Service: Connection failed (service may be down)"
        failed=$((failed + 1))
      fi
    else
      echo "  ❌ Auth Service: Tunnel not running"
      failed=$((failed + 1))
    fi
  fi
  
  # Test logging service
  local logging_config=$(get_tunnel_config "logging")
  if [ -n "$logging_config" ]; then
    IFS='|' read -r local_port remote_host remote_port display_name <<< "$logging_config"
    if check_tunnel "logging"; then
      if curl -s -f -o /dev/null -w "%{http_code}" http://localhost:$local_port/health > /dev/null 2>&1; then
        echo "  ✅ Logging Service: Connection successful"
      else
        echo "  ❌ Logging Service: Connection failed (service may be down)"
        failed=$((failed + 1))
      fi
    else
      echo "  ❌ Logging Service: Tunnel not running"
      failed=$((failed + 1))
    fi
  fi
  
  # Test notifications service
  local notifications_config=$(get_tunnel_config "notifications")
  if [ -n "$notifications_config" ]; then
    IFS='|' read -r local_port remote_host remote_port display_name <<< "$notifications_config"
    if check_tunnel "notifications"; then
      if curl -s -f -o /dev/null -w "%{http_code}" http://localhost:$local_port/health > /dev/null 2>&1; then
        echo "  ✅ Notifications Service: Connection successful"
      else
        echo "  ❌ Notifications Service: Connection failed (service may be down)"
        failed=$((failed + 1))
      fi
    else
      echo "  ❌ Notifications Service: Tunnel not running"
      failed=$((failed + 1))
    fi
  fi
  
  echo ""
  if [ $failed -eq 0 ]; then
    echo "✅ All connections successful!"
    return 0
  else
    echo "⚠️  Some connections failed ($failed failed)"
    return 1
  fi
}

# Main script logic
case "${1:-start}" in
  start)
    if [ -n "$2" ]; then
      # Start specific tunnel
      start_single_tunnel "$2"
    else
      # Start all tunnels
      start_all_tunnels
      sleep 2
      test_connections
    fi
    ;;
  stop)
    if [ -n "$2" ]; then
      # Stop specific tunnel
      stop_single_tunnel "$2"
    else
      # Stop all tunnels
      stop_all_tunnels
    fi
    ;;
  restart)
    if [ -n "$2" ]; then
      stop_single_tunnel "$2"
      sleep 1
      start_single_tunnel "$2"
    else
      stop_all_tunnels
      sleep 1
      start_all_tunnels
      sleep 2
      test_connections
    fi
    ;;
  status)
    show_status
    ;;
  test)
    test_connections
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|test} [tunnel-name]"
    echo ""
    echo "Commands:"
    echo "  start [name]   - Start all tunnels or specific tunnel (db, auth, logging, notifications)"
    echo "  stop [name]    - Stop all tunnels or specific tunnel"
    echo "  restart [name] - Restart all tunnels or specific tunnel"
    echo "  status        - Show status of all tunnels"
    echo "  test          - Test connections to all services"
    echo ""
    echo "Available tunnels:"
    for tunnel in "${TUNNELS[@]}"; do
      IFS='|' read -r name local_port remote_host remote_port display_name <<< "$tunnel"
      echo "  - $name: $display_name (localhost:$local_port)"
    done
    exit 1
    ;;
esac
