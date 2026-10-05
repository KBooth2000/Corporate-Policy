// Auto-load content modules so they can self-register (bosses, archetype behaviours, hazards, benefits, rewards...).
import.meta.glob(['./content/*.ts', './enemies/*.ts', './bosses/*.ts', './hazards/*.ts'], { eager: true });
