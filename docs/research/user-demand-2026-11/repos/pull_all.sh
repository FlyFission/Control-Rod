for r in code-yeongyu/oh-my-openagent herdrdev/herdr ParadevAI/Paradev kdlbs/kandev OrchestratorInc/agent-orchestrator multica-ai/multica BloopAI/vibe-kanban paperclipai/paperclip generalaction/emdash nimbalyst/nimbalyst stravu/crystal mistralai/mistral-vibe smtg-ai/claude-squad agent-of-empires/agent-of-empires herdrdev/herdr-app alvinunreal/oh-my-opencode-slim; do
  mkdir -p repos; f=repos/$(echo $r | tr / _).json; [ -s $f ] || python3 -I pull.py $r $f 2>>pull.log
done
echo DONE
