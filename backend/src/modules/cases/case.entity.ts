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
  phoneNumber: string; // Номер звонящего

  @Column({ type: "text", nullable: true })
  transcription: string; // Текстовая транскрипция (сплошной текст)

  // --- НОВЫЕ ПОЛЯ ДЛЯ AI & ЕРДР ---
  @Column({ type: "simple-json", nullable: true })
  transcript: any[]; // Структурированная история диалога (JSON)

  @Column({ nullable: true })
  erdr_district: string; // Район для ЕРДР (Заводской, Алматинский и т.д.)

  @Column({ type: "simple-json", nullable: true })
  callerInfo: any; // Техническая информация (IP, Geo, Device)
  // --------------------------------

  @Column({ type: "text", nullable: true })
  textVersion: string; 

  @Column({ nullable: true })
  category: string; 

  @Column({ nullable: true })
  serviceType: string; 

  @Column({ nullable: true })
  priority: string; 

  @Column({ nullable: true })
  audioUrl: string; // Ссылка на аудиозапись

  @Column({ default: false })
  isCompleted: boolean; 

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  operatorId: string; 

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "operatorId" })
  operator: User;

  @Column({ nullable: true })
  assigneeId: string; 

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "assigneeId" })
  assignee: User;

  @Column({ type: "simple-json", nullable: true })
  metadata: any; 

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}