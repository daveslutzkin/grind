import type { SkillInfo } from "../../../session/types"

interface SkillsProps {
  skills: SkillInfo[]
}

export function Skills({ skills }: SkillsProps) {
  return (
    <div class="skills panel">
      <h3>Skills</h3>
      <ul>
        {skills.map((skill) => (
          <li key={skill.id}>
            <div class="skill-header">
              <span class="skill-name">{skill.id}</span>
              <span class="skill-level">Lv {skill.level}</span>
            </div>
            <div class="skill-progress">
              <div
                class="skill-progress-bar"
                style={{
                  width: `${skill.xpToNextLevel > 0 ? (skill.xp / skill.xpToNextLevel) * 100 : 100}%`,
                }}
              />
              <span class="skill-xp">
                {skill.xp}/{skill.xpToNextLevel} XP
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
