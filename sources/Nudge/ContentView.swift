//
//  ContentView.swift
//  Nudge
//
//  Created by Gordon Huang
//

import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = ScheduleViewModel()
    
    var body: some View {
        NavigationView {
            VStack {
                Text("Welcome to Nudge")
                    .font(.largeTitle)
                    .padding()
                Text("Your personal voice assistant for daily planning")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding()
                
                Button(action: {
                    viewModel.startVoiceInput()
                }) {
                    Text(viewModel.isRecording ? "Recording..." : "Start Planning")
                        .font(.title2)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                }
                .padding()
                
                if let schedule = viewModel.currentSchedule {
                    List(schedule.tasks) { task in
                        VStack(alignment: .leading) {
                            Text(task.title)
                                .font(.headline)
                            Text("\(task.startTime.formatted()) - \(task.endTime.formatted())")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Nudge")
        }
        .onAppear {
            NotificationService.shared.requestAuthorization()
            CalendarService.shared.requestAccess { granted in
                if granted {
                    print("Calendar access granted")
                }
            }
        }
    }
}