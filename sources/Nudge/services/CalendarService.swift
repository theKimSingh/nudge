//
//  CalendarService.swift
//  Nudge
//
//  Created by Gordon Huang
//

import Foundation
import EventKit

class CalendarService {
    static let shared = CalendarService()
    
    private let eventStore = EKEventStore()
    
    private init() {}
    
    func requestAccess(completion: @escaping (Bool) -> Void) {
        eventStore.requestAccess(to: .event) { granted, error in
            completion(granted)
        }
    }
    
    func addEvent(for task: NudgeTask) {
        let event = EKEvent(eventStore: eventStore)
        event.title = task.title
        event.startDate = task.startTime
        event.endDate = task.endTime
        event.calendar = eventStore.defaultCalendarForNewEvents
        
        do {
            try eventStore.save(event, span: .thisEvent)
        } catch {
            print("Error saving event: \(error)")
        }
    }
}