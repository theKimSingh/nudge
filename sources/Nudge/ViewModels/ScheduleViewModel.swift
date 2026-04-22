//
//  ScheduleViewModel.swift
//  Nudge
//
//  Created by Gordon Huang
//

import Foundation
import Combine

class ScheduleViewModel: ObservableObject {
    @Published var currentSchedule: Schedule?
    @Published var isRecording = false
    
    private var cancellables = Set<AnyCancellable>()
    
    func generateSchedule(from speech: String) {
        // Parse speech and generate tasks
        // For now, placeholder
        let tasks = [
            NudgeTask(title: "Morning meeting", startTime: Date(), endTime: Date().addingTimeInterval(3600)),
            NudgeTask(title: "Lunch", startTime: Date().addingTimeInterval(7200), endTime: Date().addingTimeInterval(9000))
        ]
        currentSchedule = Schedule(date: Date(), tasks: tasks)
        
        // Save to Supabase
        if let schedule = currentSchedule {
            Task {
                try? await SupabaseService.shared.saveSchedule(schedule)
            }
        }
        
        // Add to calendar
        for task in tasks {
            CalendarService.shared.addEvent(for: task)
        }
        
        // Schedule notifications
        for task in tasks {
            NotificationService.shared.scheduleNotification(for: task)
        }
    }
    
    func startVoiceInput() {
        isRecording = true
        WisprService.shared.startSpeechToText { [weak self] text in
            self?.isRecording = false
            if let text = text {
                self?.generateSchedule(from: text)
            }
        }
    }
}