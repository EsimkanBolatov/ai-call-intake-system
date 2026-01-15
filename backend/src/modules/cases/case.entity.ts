import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "../users/user.entity";

@Entity("cases")
export class Case {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  title: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ default: "pending" })
  status: string; // pending, assigned, in_progress, completed, cancelled

  @Column({ nullable: true })
  phoneNumber: string; // Номер звонящего (87074536449)

  @Column({ type: "text", nullable: true })
  transcription: string; // Транскрипция разговора

  @Column({ type: "text", nullable: true })
  textVersion: string; // Текстовая версия (может быть равно transcription)

  @Column({ nullable: true })
  category: string; // срочный, нормальный, просто

  @Column({ nullable: true })
  serviceType: string; // fire, emergency, ambulance, police, other

  @Column({ nullable: true })
  priority: string; // high, medium, low

  @Column({ nullable: true })
  audioUrl: string; // Ссылка на аудиозапись

  @Column({ default: false })
  isCompleted: boolean; // Птичка - выполнено

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  operatorId: string; // Оператор, принявший звонок

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "operatorId" })
  operator: User;

  @Column({ nullable: true })
  assigneeId: string; // Сотрудник, назначенный на выполнение

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "assigneeId" })
  assignee: User;

  @Column({ type: "simple-json", nullable: true })
  metadata: any; // Дополнительные данные (локация, детали)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
